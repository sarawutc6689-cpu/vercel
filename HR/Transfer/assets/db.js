/* ========================================================
   ชั้นเข้าถึงข้อมูล (Data Access Layer) — คุยกับ Supabase จริง
   ทุกฟังก์ชัน throw Error เมื่อล้มเหลว ให้ผู้เรียกจับด้วย try/catch
   ======================================================== */

const db = {

  /* ---------------- Lookups (แผนก / หน่วยงาน) ---------------- */
  async getDepartments() {
    const { data, error } = await sb.from('departments').select('*').order('name');
    if (error) throw error;
    return data;
  },

  async getUnits() {
    const { data, error } = await sb.from('units').select('*').order('name');
    if (error) throw error;
    return data;
  },

  /* ---------------- หน้า 1: คำขอยืม ---------------- */
  async getAvailableEmployees(departmentId) {
    const { data, error } = await sb
      .from('employees')
      .select('id, employee_code, full_name, home_department_id, status')
      .eq('home_department_id', departmentId)
      .order('employee_code');
    if (error) throw error;
    return data;
  },

  async createTransferRequest({ sourceDeptId, destDeptId, startDate, endDate, note, employeeIds }) {
    const { data, error } = await sb.rpc('create_transfer_request', {
      p_source_department_id: sourceDeptId,
      p_destination_department_id: destDeptId,
      p_start_date: startDate,
      p_end_date: endDate,
      p_note: note || null,
      p_employee_ids: employeeIds,
    });
    if (error) throw error;
    return data; // request id
  },

  /* ---------------- หน้า 2: การจัดการคำขอ ---------------- */
  async getRequestItems({ status = 'pending', search = '' } = {}) {
    let query = sb.from('v_transfer_requests_list').select('*');
    if (status && status !== 'all') query = query.eq('item_status', status);
    if (search) query = query.or(`employee_code.ilike.%${search}%,full_name.ilike.%${search}%`);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },

  async approveItem(itemId, unitId) {
    const { error } = await sb.rpc('approve_transfer_item', {
      p_item_id: itemId,
      p_unit_id: unitId || null,
    });
    if (error) throw error;
  },

  async rejectItem(itemId, reason) {
    const { error } = await sb.rpc('reject_transfer_item', {
      p_item_id: itemId,
      p_reason: reason || null,
    });
    if (error) throw error;
  },

  /* ---------------- หน้า 3: ขอคืน ---------------- */
  async getEmployeesOnLoan() {
    const { data, error } = await sb.from('v_employees_on_loan').select('*').order('end_date');
    if (error) throw error;
    return data;
  },

  async returnItem(itemId, note) {
    const { error } = await sb.rpc('return_transfer_item', {
      p_item_id: itemId,
      p_note: note || null,
    });
    if (error) throw error;
  },

  /* ---------------- หน้า 4: สถานะการโอนย้าย ---------------- */
  // ใช้ getEmployeesOnLoan() ร่วมกับหน้า 3 ได้เลย (view เดียวกัน)

  /* ---------------- หน้า 5: ประวัติ ---------------- */
  async getHistory({ search = '', action = '', from = '', to = '' } = {}) {
    let query = sb.from('v_transfer_history').select('*');
    if (action) query = query.eq('action', action);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to + 'T23:59:59');
    const { data, error } = await query.order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    if (search) {
      const s = search.toLowerCase();
      return data.filter(h =>
        (h.request_no || '').toLowerCase().includes(s) ||
        (h.employee_code || '').toLowerCase().includes(s) ||
        (h.full_name || '').toLowerCase().includes(s));
    }
    return data;
  },

  /* ---------------- หน้า 6: รายงาน ---------------- */
  async getReportRows({ fromDate = '', toDate = '', sourceDeptId = '', destDeptId = '', status = '' } = {}) {
    let query = sb.from('v_transfer_requests_list').select('*');
    if (fromDate) query = query.gte('start_date', fromDate);
    if (toDate) query = query.lte('start_date', toDate);
    if (sourceDeptId) query = query.eq('source_department_id', sourceDeptId);
    if (destDeptId) query = query.eq('destination_department_id', destDeptId);
    if (status && status !== 'all') query = query.eq('item_status', status);
    const { data, error } = await query.order('start_date', { ascending: false }).limit(2000);
    if (error) throw error;
    return data;
  },

  /* ---------------- หน้าจัดการพนักงาน (แอดมิน) ---------------- */
  async getEmployeeAdminList({ search = '' } = {}) {
    let query = sb.from('v_employee_admin_list').select('*');
    if (search) query = query.or(`employee_code.ilike.%${search}%,full_name.ilike.%${search}%`);
    const { data, error } = await query.order('employee_code').limit(1000);
    if (error) throw error;
    return data;
  },

  async upsertEmployee({ employeeCode, fullName, homeDeptId, hireDate }) {
    const { error } = await sb.rpc('admin_upsert_employee', {
      p_employee_code: employeeCode,
      p_full_name: fullName,
      p_home_department_id: homeDeptId,
      p_hire_date: hireDate || null,
    });
    if (error) throw error;
  },

  async setEmployeeRole(employeeCode, role) {
    const { error } = await sb.rpc('admin_set_employee_role', {
      p_employee_code: employeeCode,
      p_role: role,
    });
    if (error) throw error;
  },

  async setApproverDepartments(employeeCode, departmentIds) {
    const { error } = await sb.rpc('admin_set_approver_departments', {
      p_employee_code: employeeCode,
      p_department_ids: departmentIds,
    });
    if (error) throw error;
  },
};
