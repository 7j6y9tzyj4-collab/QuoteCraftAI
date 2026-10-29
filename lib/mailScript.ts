// Google Apps Script, який власник вставляє у script.google.com (свій Google-акаунт).
// Кожні 15 хв шукає нові листи-чеки від магазинів і надсилає їх у QuoteCraft. Нічого в пошті не змінює.
export function mailScript(key:string,origin:string){
  return `// QuoteCraft — чеки з Gmail. Нічого в пошті не змінює, лише читає листи магазинів.
var QC_URL = '${origin}/api/receipts-mail';
var QC_KEY = '${key}';
var QUERY = 'from:(flooranddecor.com OR homedepot.com OR menards.com OR lowes.com) subject:(receipt OR order OR purchase) newer_than:3d';

// 1) Натисни ▶ Run на функції setup один раз (дозволь доступ). Далі працює саме кожні 15 хв.
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('run').timeBased().everyMinutes(15).create();
  run();
}

function run() {
  var props = PropertiesService.getScriptProperties();
  var done = JSON.parse(props.getProperty('done') || '[]');
  var threads = GmailApp.search(QUERY, 0, 40);
  threads.forEach(function (th) {
    th.getMessages().forEach(function (m) {
      var id = m.getId();
      if (done.indexOf(id) >= 0) return;
      if (Date.now() - m.getDate().getTime() > 3 * 864e5) return;
      try {
        var r = UrlFetchApp.fetch(QC_URL, {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          payload: JSON.stringify({ key: QC_KEY, id: id, from: m.getFrom(), subject: m.getSubject(), date: m.getDate().toISOString(), html: m.getBody() })
        });
        if (r.getResponseCode() < 300) done.push(id);
      } catch (e) { /* спробує наступного разу */ }
    });
  });
  props.setProperty('done', JSON.stringify(done.slice(-400)));
}
`;
}
