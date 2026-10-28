/* supabase-api.js
 * ใช้แทน google.script.run โดยไม่ต้องแก้โค้ดเดิมในหน้า HTML
 * ใส่ก่อน script อื่นในทุกหน้า:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="supabase-api.js"></script>
 */
(function () {
  // ---- โปรเจคจองห้อง ----
  const BOOKING_URL = 'https://gkrsurhpyvpcwkxrocyr.supabase.co';
  const BOOKING_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrcnN1cmhweXZwY3dreHJvY3lyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NjQ2MTcsImV4cCI6MjEwNjI0MDYxN30.CxowgwkuG66EiUgeYG772CVgfGfrzjNhmae1xzG3sLc';
  // ---- โปรเจค users (ต้นทางรายชื่อพนักงาน) ----
  const USERS_URL = 'https://ppzdyvomrfiitahxwrwz.supabase.co';
  const USERS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwemR5dm9tcmZpaXRhaHh3cnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMjQ0MjIsImV4cCI6MjEwNDYwMDQyMn0.iArUz6swMfwhFT_1qEvCwK1B3aiCxdWt46_FBjT6_Y0';               // anon/publishable key เท่านั้น
  const USERS_RPC = 'booking_users';                  // ดู SQL ท้ายไฟล์ 01_schema.sql

  const sb = supabase.createClient(BOOKING_URL, BOOKING_KEY);
  const sbUsers = supabase.createClient(USERS_URL, USERS_KEY);

  const hm = t => (t || '').toString().slice(0, 5);   // 'HH:MM:SS' -> 'HH:MM'
  const todayTH = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  const toBooking = r => ({
    id: r.booking_id, roomId: r.room_id, roomName: r.room_name,
    date: r.booking_date, startTime: hm(r.start_time), endTime: hm(r.end_time),
    bookerName: r.booker_name, department: r.department || '', agenda: r.agenda || '',
    status: r.status, userCode: r.user_code || '',
    userSection: r.user_section || '', userPosition: r.user_position || ''
  });

  const must = ({ data, error }) => { if (error) throw error; return data; };

  // cache รายชื่อ users ต่อหนึ่งการเปิดหน้า
  let usersCache = null;
  async function getUsers() {
    if (usersCache) return usersCache;
    const rows = must(await sbUsers.rpc(USERS_RPC));
    usersCache = rows.map(u => ({
      code: String(u.code ?? ''), name: u.name ?? '', section: u.section ?? '',
      department: u.department ?? '', position: u.position ?? ''
    }));
    return usersCache;
  }

  const fns = {
    async getRooms() {
      const d = must(await sb.from('rooms').select('*').eq('status', 'active').order('id'));
      return d.map(r => ({ id: r.id, name: r.name, capacity: r.capacity, facilities: r.facilities || '', status: r.status }));
    },

    getUsers,

    async getUserByCode(code) {
      return (await getUsers()).find(u => u.code === String(code)) || null;
    },

    async getBookings(date) {
      const d = must(await sb.from('bookings').select('*')
        .eq('booking_date', date).eq('status', 'confirmed'));
      return d.map(toBooking);
    },

    async getAllBookings() {
      const d = must(await sb.from('bookings').select('*').eq('status', 'confirmed').order('booking_date'));
      return d.map(toBooking);
    },

    async getAllCancelledBookings() {
      const d = must(await sb.from('bookings').select('*').eq('status', 'cancelled')
        .order('cancelled_at', { ascending: false }));
      return d.map(r => ({ ...toBooking(r), cancelledDate: (r.cancelled_at || r.created_at || '').slice(0, 10) }));
    },

    async getMyBookings(bookerName) {
      const today = todayTH();
      const d = must(await sb.from('bookings').select('*')
        .eq('booker_name', bookerName).eq('status', 'confirmed')
        .order('booking_date').order('start_time'));
      return d.map(r => ({
        id: r.booking_id, roomName: r.room_name, date: r.booking_date,
        startTime: hm(r.start_time), endTime: hm(r.end_time), agenda: r.agenda || '',
        status: r.booking_date >= today ? 'upcoming' : 'past'
      }));
    },

    async getDashboardStats() {
      const today = todayTH();
      const count = q => q.then(({ count, error }) => { if (error) throw error; return count || 0; });
      const conf = () => sb.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed');
      const [totalRooms, totalBookings, todayBookings, upcomingBookings] = await Promise.all([
        count(sb.from('rooms').select('*', { count: 'exact', head: true })),
        count(conf()),
        count(conf().eq('booking_date', today)),
        count(conf().gte('booking_date', today))
      ]);
      return { totalRooms, todayBookings, totalBookings, upcomingBookings };
    },

    async checkAvailability(roomId, date, startTime, endTime) {
      const d = must(await sb.from('bookings').select('start_time,end_time')
        .eq('room_id', roomId).eq('booking_date', date).eq('status', 'confirmed')
        .lt('start_time', endTime).gt('end_time', startTime));
      return d.length === 0;
    },

    async createBooking(b) {
      const { data, error } = await sb.rpc('create_booking', { p: b });
      if (error) return { success: false, message: 'เกิดข้อผิดพลาด: ' + error.message };
      return data;
    },

    async cancelBooking(bookingId, userCode) {
      const { data, error } = await sb.rpc('cancel_booking',
        { p_booking_id: bookingId, p_user_code: userCode ?? null });
      if (error) return { success: false, message: 'เกิดข้อผิดพลาด: ' + error.message };
      return data;
    }
  };

  // ---- shim: google.script.run.withSuccessHandler(f).withFailureHandler(g).fn(...) ----
  function runner(ok, fail) {
    return new Proxy({}, {
      get(_, name) {
        if (name === 'withSuccessHandler') return f => runner(f, fail);
        if (name === 'withFailureHandler') return g => runner(ok, g);
        return (...args) => {
          if (!fns[name]) { (fail || console.error)(new Error('Unknown function: ' + String(name))); return; }
          fns[name](...args).then(r => ok && ok(r)).catch(e => { console.error(name, e); (fail || (() => {}))(e); });
        };
      }
    });
  }
  window.google = { script: { get run() { return runner(null, null); } } };
})();
