// ============================================
// 旅遊規劃高手 - LINE 提醒系統
// Google Apps Script v1.0
// ============================================
// ✅ 安全驗證機制
// ✅ 行程提醒排程（前1天、前2小時、前1小時、前30分鐘）
// ✅ Google Sheets 排程資料庫
// ✅ 時間觸發器自動檢查（每15分鐘）
// ============================================
// 
// 📌 部署步驟：
// 1. 修改下方 SECURITY_SECRET 為您的暗號
// 2. 部署 → 新增部署 → 網頁應用程式
// 3. 執行身分: 我 / 存取權: 所有人
// 4. 首次部署後，執行一次 setupTrigger() 函數
// 5. 完成！
//
// ============================================

// ============================================
// 🔐 安全設定區 - 請務必修改！
// ============================================
const SECURITY_SECRET = 'YOUR_SECRET_KEY_HERE';
// ⚠️ 請改成您自己的暗號，例如：'MyTravel2025!@#$%^'
// 建議使用 16 字元以上的隨機字串

// ============================================
// 📊 Google Sheets 設定
// ============================================
const SPREADSHEET_NAME = '旅遊規劃提醒排程資料庫';
const SHEET_NAME = '行程提醒';

// ============================================
// 主要入口點
// ============================================

function doGet(e) {
  return ContentService.createTextOutput(
    '╔════════════════════════════════════════╗\n' +
    '║  ✈️ 旅遊規劃高手 - LINE 提醒系統       ║\n' +
    '║  v1.0 - 加密防護 + 提醒排程功能        ║\n' +
    '╚════════════════════════════════════════╝\n\n' +
    '✅ 系統運作中\n' +
    '📊 排程資料庫: ' + SPREADSHEET_NAME + '\n' +
    '⏰ 觸發器: 每 15 分鐘自動檢查\n'
  );
}

function doPost(e) {
  try {
    var requestData = JSON.parse(e.postData.contents);
    
    // 🔒 驗證 Secret Key
    if (!requestData.secret || requestData.secret !== SECURITY_SECRET) {
      Logger.log('❌ 未授權的請求被拒絕');
      Logger.log('請求時間: ' + new Date().toISOString());
      return createResponse(false, '未授權的請求');
    }
    
    // 根據 action 分派處理
    var action = requestData.action || 'sendNotification';
    Logger.log('📥 收到請求: action=' + action);
    
    switch (action) {
      case 'createSchedules':
        return handleCreateSchedules(requestData);
      
      case 'getSchedules':
        return handleGetSchedules(requestData);
      
      case 'clearSchedules':
        return handleClearSchedules(requestData);
      
      case 'sendNotification':
      default:
        return handleSendNotification(requestData);
    }
    
  } catch (error) {
    Logger.log('❌ 系統錯誤: ' + error.toString());
    return createResponse(false, '系統錯誤: ' + error.toString());
  }
}

// ============================================
// 📨 發送即時通知
// ============================================
function handleSendNotification(requestData) {
  var token = requestData.token;
  var userId = requestData.userId;
  var message = requestData.message;
  
  if (!token || !userId) {
    return createResponse(false, '缺少必要參數 (token 或 userId)');
  }
  
  if (!message) {
    return createResponse(false, '缺少訊息內容');
  }
  
  Logger.log('✅ 發送即時通知');
  
  var result = sendLineMessage(token, userId, message);
  
  if (result.success) {
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: '訊息發送成功',
      sentAt: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  } else {
    return createResponse(false, result.message);
  }
}

// ============================================
// 🔔 建立提醒排程
// ============================================
function handleCreateSchedules(requestData) {
  var schedules = requestData.schedules;
  var token = requestData.token;
  var userId = requestData.userId;
  
  if (!schedules || schedules.length === 0) {
    return createResponse(false, '沒有排程資料');
  }
  
  if (!token || !userId) {
    return createResponse(false, '缺少 LINE 認證資訊');
  }
  
  Logger.log('🔔 建立提醒排程: ' + schedules.length + ' 個');
  
  try {
    var sheet = getOrCreateScheduleSheet();
    var addedCount = 0;
    
    for (var i = 0; i < schedules.length; i++) {
      var schedule = schedules[i];
      
      // 檢查提醒時間是否在未來
      var reminderTime = new Date(schedule.reminderTime);
      if (reminderTime <= new Date()) {
        Logger.log('⏭️ 跳過已過期的提醒: ' + schedule.workshopTitle);
        continue;
      }
      
      // 新增一列資料
      sheet.appendRow([
        new Date(),                           // A: 建立時間
        schedule.workshopTitle,               // B: 行程標題
        schedule.workshopStart,               // C: 行程開始時間
        schedule.workshopEnd,                 // D: 行程結束時間
        schedule.workshopLocation || '',      // E: 地點
        schedule.workshopDescription || '',   // F: 描述
        schedule.reminderTime,                // G: 提醒時間 (ISO string)
        schedule.reminderMinutes,             // H: 提前分鐘數
        schedule.reminderLabel,               // I: 提醒標籤
        'pending',                            // J: 狀態
        token,                                // K: LINE Token
        userId,                               // L: LINE User ID
        ''                                    // M: 發送時間（稍後填入）
      ]);
      
      addedCount++;
    }
    
    Logger.log('✅ 已建立 ' + addedCount + ' 個提醒排程');
    
    // 確保時間觸發器已設定
    ensureTimeTrigger();
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: '已建立 ' + addedCount + ' 個提醒排程',
      count: addedCount
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('❌ 建立排程失敗: ' + error.toString());
    return createResponse(false, '建立排程失敗: ' + error.toString());
  }
}

// ============================================
// 📋 查詢排程
// ============================================
function handleGetSchedules(requestData) {
  try {
    var sheet = getOrCreateScheduleSheet();
    var lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        schedules: []
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
    var schedules = [];
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (row[1]) { // 確保有行程標題
        schedules.push({
          createdAt: row[0],
          title: row[1],
          startTime: row[2],
          endTime: row[3],
          location: row[4],
          description: row[5],
          reminderTime: row[6],
          reminderMinutes: row[7],
          reminderLabel: row[8],
          status: row[9],
          sentAt: row[12]
        });
      }
    }
    
    Logger.log('📋 查詢排程: 共 ' + schedules.length + ' 筆');
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      schedules: schedules
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('❌ 查詢排程失敗: ' + error.toString());
    return createResponse(false, '查詢失敗: ' + error.toString());
  }
}

// ============================================
// 🗑️ 清除所有排程
// ============================================
function handleClearSchedules(requestData) {
  try {
    var sheet = getOrCreateScheduleSheet();
    var lastRow = sheet.getLastRow();
    
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
      Logger.log('🗑️ 已清除 ' + (lastRow - 1) + ' 筆排程');
    }
    
    return createResponse(true, '已清除所有排程');
    
  } catch (error) {
    Logger.log('❌ 清除排程失敗: ' + error.toString());
    return createResponse(false, '清除失敗: ' + error.toString());
  }
}

// ============================================
// ⏰ 時間觸發器 - 檢查並發送提醒（核心功能！）
// ============================================
function checkAndSendReminders() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('⏰ 開始檢查行程提醒...');
  Logger.log('檢查時間: ' + new Date().toLocaleString('zh-TW'));
  
  try {
    var sheet = getOrCreateScheduleSheet();
    var lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      Logger.log('📭 沒有排程資料');
      return;
    }
    
    var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();
    var now = new Date();
    var sentCount = 0;
    var expiredCount = 0;
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var status = row[9]; // J: 狀態
      
      if (status !== 'pending') continue;
      
      var reminderTime = new Date(row[6]); // G: 提醒時間
      var title = row[1];                   // B: 行程標題
      var startTime = row[2];               // C: 開始時間
      var endTime = row[3];                 // D: 結束時間
      var location = row[4];                // E: 地點
      var description = row[5];             // F: 描述
      var reminderLabel = row[8];           // I: 提醒標籤
      var token = row[10];                  // K: LINE Token
      var userId = row[11];                 // L: LINE User ID
      
      // 檢查是否已到提醒時間
      if (reminderTime <= now) {
        // 檢查行程是否已過期
        var scheduleStart = new Date(startTime);
        if (scheduleStart < now) {
          // 行程已過期，標記為過期
          sheet.getRange(i + 2, 10).setValue('expired');
          expiredCount++;
          Logger.log('⏭️ 行程已過期: ' + title);
          continue;
        }
        
        // 發送提醒
        var message = formatReminderMessage(title, startTime, endTime, location, description, reminderLabel);
        var result = sendLineMessage(token, userId, message);
        
        if (result.success) {
          // 更新狀態
          sheet.getRange(i + 2, 10).setValue('sent');
          sheet.getRange(i + 2, 13).setValue(new Date().toISOString());
          sentCount++;
          Logger.log('✅ 已發送提醒: ' + title);
        } else {
          Logger.log('❌ 發送失敗: ' + title + ' - ' + result.message);
        }
      }
    }
    
    Logger.log('───────────────────────────────────────');
    Logger.log('📊 本次檢查結果:');
    Logger.log('   發送成功: ' + sentCount + ' 則');
    Logger.log('   已過期: ' + expiredCount + ' 則');
    Logger.log('═══════════════════════════════════════');
    
  } catch (error) {
    Logger.log('❌ 檢查提醒失敗: ' + error.toString());
  }
}

// ============================================
// 📨 發送 LINE 訊息
// ============================================
function sendLineMessage(token, userId, message) {
  var url = 'https://api.line.me/v2/bot/message/push';
  
  var payload = {
    to: userId,
    messages: [{
      type: 'text',
      text: message
    }]
  };
  
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      return { success: true };
    } else {
      var responseBody = response.getContentText();
      Logger.log('LINE API 錯誤: ' + responseCode + ' - ' + responseBody);
      return { success: false, message: 'LINE API 錯誤: ' + responseCode };
    }
  } catch (error) {
    Logger.log('發送訊息錯誤: ' + error.toString());
    return { success: false, message: error.toString() };
  }
}

// ============================================
// 📝 格式化提醒訊息
// ============================================
function formatReminderMessage(title, startTime, endTime, location, description, reminderLabel) {
  var message = '';
  
  message += '╔═══════════════════════╗\n';
  message += '║   ✈️ 行程提醒通知   ║\n';
  message += '╚═══════════════════════╝\n\n';
  
  message += '🔔 ' + (reminderLabel || '提醒') + '\n\n';
  
  message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  message += '📌 ' + title + '\n\n';
  
  var startDate = new Date(startTime);
  var endDate = new Date(endTime);
  
  message += '⏰ 時間資訊\n';
  message += '┣━ 日期: ' + formatDate(startDate) + '\n';
  message += '┣━ 時段: ' + formatTime(startDate) + ' - ' + formatTime(endDate) + '\n';
  
  var daysUntil = calculateDaysUntil(startDate);
  if (daysUntil === 0) {
    message += '┗━ ⚡ 今天！\n\n';
  } else if (daysUntil === 1) {
    message += '┗━ 📅 明天\n\n';
  } else {
    message += '┗━ 📅 ' + daysUntil + ' 天後\n\n';
  }
  
  if (location) {
    message += '📍 地點\n';
    message += '┗━ ' + location + '\n\n';
  }
  
  if (description) {
    message += '📝 備註\n';
    message += '┗━ ' + description + '\n\n';
  }
  
  message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  message += '💡 溫馨提醒\n';
  message += '• 請提前準備相關物品\n';
  message += '• 確認交通方式\n';
  message += '• 祝旅途愉快！🎉\n';
  
  return message;
}

// ============================================
// 🔧 輔助函數
// ============================================

function getOrCreateScheduleSheet() {
  var spreadsheet;
  
  // 嘗試找到現有的 Spreadsheet
  var files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  if (files.hasNext()) {
    var file = files.next();
    spreadsheet = SpreadsheetApp.openById(file.getId());
  } else {
    // 建立新的 Spreadsheet
    spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
    Logger.log('📊 已建立新的排程資料庫');
    Logger.log('   網址: ' + spreadsheet.getUrl());
  }
  
  // 取得或建立工作表
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    // 設定標題列
    sheet.getRange(1, 1, 1, 13).setValues([[
      '建立時間', '行程標題', '開始時間', '結束時間', '地點', '描述',
      '提醒時間', '提前分鐘', '提醒標籤', '狀態', 'LINE Token', 'LINE UserID', '發送時間'
    ]]);
    sheet.getRange(1, 1, 1, 13).setFontWeight('bold');
    sheet.getRange(1, 1, 1, 13).setBackground('#06b6d4');
    sheet.getRange(1, 1, 1, 13).setFontColor('white');
    sheet.setFrozenRows(1);
    
    // 隱藏敏感欄位
    sheet.hideColumns(11); // LINE Token
    sheet.hideColumns(12); // LINE UserID
    
    Logger.log('📋 已建立排程工作表');
  }
  
  return sheet;
}

function ensureTimeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var hasReminderTrigger = false;
  
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkAndSendReminders') {
      hasReminderTrigger = true;
      break;
    }
  }
  
  if (!hasReminderTrigger) {
    ScriptApp.newTrigger('checkAndSendReminders')
      .timeBased()
      .everyMinutes(15)
      .create();
    Logger.log('⏰ 已建立時間觸發器（每 15 分鐘）');
  }
}

// 🔧 首次部署後，請手動執行此函數一次！
function setupTrigger() {
  // 先刪除舊的觸發器
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkAndSendReminders') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 建立新的觸發器
  ScriptApp.newTrigger('checkAndSendReminders')
    .timeBased()
    .everyMinutes(15)
    .create();
  
  Logger.log('═══════════════════════════════════════');
  Logger.log('✅ 時間觸發器設定完成！');
  Logger.log('⏰ 系統將每 15 分鐘自動檢查提醒排程');
  Logger.log('═══════════════════════════════════════');
  
  // 同時建立排程資料庫
  var sheet = getOrCreateScheduleSheet();
  Logger.log('📊 排程資料庫已就緒');
}

// 手動測試提醒檢查
function testCheckReminders() {
  Logger.log('🧪 手動執行提醒檢查...');
  checkAndSendReminders();
}

function createResponse(success, message) {
  return ContentService.createTextOutput(JSON.stringify({
    success: success,
    error: success ? undefined : message,
    message: success ? message : undefined
  })).setMimeType(ContentService.MimeType.JSON);
}

// 日期時間格式化函數
function calculateDaysUntil(targetDate) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  var diffMs = target - today;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatDate(date) {
  var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  var weekday = weekdays[date.getDay()];
  return year + '/' + month + '/' + day + ' (週' + weekday + ')';
}

function formatTime(date) {
  var hours = String(date.getHours()).padStart(2, '0');
  var minutes = String(date.getMinutes()).padStart(2, '0');
  return hours + ':' + minutes;
}

// ============================================
// 📌 使用說明
// ============================================
// 
// 【首次設定步驟】
// 
// 1. 修改 SECURITY_SECRET（第 26 行）
//    將 'YOUR_SECRET_KEY_HERE' 改成您的暗號
// 
// 2. 部署為網頁應用程式
//    - 點選「部署」→「新增部署」
//    - 選擇「網頁應用程式」
//    - 執行身分：我
//    - 存取權：所有人
//    - 點選「部署」
// 
// 3. 授權
//    - 首次部署會要求授權
//    - 授權存取 Google Sheets 和外部服務
// 
// 4. 設定時間觸發器
//    - 在 GAS 編輯器中選擇函數「setupTrigger」
//    - 點選「執行」按鈕
//    - 這會建立每 15 分鐘自動執行的觸發器
// 
// 5. 完成！
//    - 系統會自動在 Google Drive 建立「旅遊規劃提醒排程資料庫」
//    - 所有提醒排程都會儲存在裡面
//    - 每 15 分鐘自動檢查並發送到期的提醒
// 
// ============================================
