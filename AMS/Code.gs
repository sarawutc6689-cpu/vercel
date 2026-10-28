function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบขอจองรถใช้งานบริษัท')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ดึงข้อมูลพนักงานทั้งหมด
function getEmployees() {
  const ss = SpreadsheetApp.openById('1EmxCq3YIkK0xnoTs2T8gO-BKiFV_4GF0hJvnYdxpu1s');
  const sheet = ss.getSheets()[0];
  const data = sheet.getRange(2,1,sheet.getLastRow()-1,5).getValues();

  return data.map(r => ({
    code: r[0],
    name: r[1],
    section: r[2],
    department: r[3],
    position: r[4]
  }));
}

// บันทึกข้อมูลการจองรถ
function saveReservation(data) {
  const ss = SpreadsheetApp.openById('1-5izB7N6ldxHAa3ca0RNhGP8Z36vuA0mw9Wi_xR_Lj4');
  const sheet = ss.getSheets()[0];

  sheet.appendRow([
    new Date(),          // Timestamp
    data.name,
    data.section,
    data.department,
    data.position,
    data.contact,
    data.choose,
    data.rentStartdate,
    data.rentEnddate,
    data.reason
  ]);

  return { success: true };
}
