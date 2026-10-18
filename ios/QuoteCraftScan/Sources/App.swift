import SwiftUI
import UIKit

// QuoteCraft Scan — LiDAR-скан кімнати (Apple RoomPlan) → QuoteCraft.
// Перший раз: код з QuoteCraft прив'язує iPhone (ключ пристрою зберігається). Далі додаток сам бере останню заявку «Сканувати LiDAR».
@main
struct QuoteCraftScanApp: App {
    @StateObject private var session = ScanSession()
    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(session)
                .onOpenURL { url in session.handle(url: url) }
        }
    }
}

final class ScanSession: ObservableObject {
    @Published var token: String? = nil
    @Published var api: String = UserDefaults.standard.string(forKey: "api") ?? "https://quotecraftai-app.vercel.app"
    @Published var status: String = ""
    @Published var payload: [String: Any]? = nil
    var shots: [ScanShot] = []
    @Published var sending = false
    @Published var sent = false
    @Published var pin: String = ""
    @Published var claiming = false
    @Published var checking = false
    @Published var deviceKey: String? = UserDefaults.standard.string(forKey: "deviceKey")
    var paired: Bool { deviceKey != nil }

    func handle(url: URL) {
        guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        token = c.queryItems?.first(where: { $0.name == "token" })?.value
        if let a = c.queryItems?.first(where: { $0.name == "api" })?.value, a.hasPrefix("https://") { api = a; UserDefaults.standard.set(a, forKey: "api") }
        payload = nil; sent = false; status = token == nil ? "" : "Готово до сканування"
    }

    private func post(_ path: String, _ body: [String: Any], _ done: @escaping (Int, [String: Any]?, Error?) -> Void) {
        var req = URLRequest(url: URL(string: api + path)!)
        req.httpMethod = "POST"; req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req) { data, resp, err in
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            DispatchQueue.main.async { done(code, json, err) }
        }.resume()
    }

    // Один раз: код з QuoteCraft → токен + ключ пристрою (далі без кодів)
    func claim() {
        let code = pin.filter(\.isNumber)
        guard code.count == 6, !claiming else { status = "Введи 6 цифр коду з QuoteCraft."; return }
        claiming = true; status = "Перевіряю код…"
        post("/api/scan-claim", ["pin": code, "device": UIDevice.current.name]) { code, json, err in
            self.claiming = false
            if let err { self.status = "Помилка: " + err.localizedDescription; return }
            if let t = json?["token"] as? String {
                if let k = json?["deviceKey"] as? String { self.deviceKey = k; UserDefaults.standard.set(k, forKey: "deviceKey") }
                self.token = t; self.sent = false; self.pin = ""
                self.status = "✅ iPhone прив'язано. Можна сканувати."
                if self.payload != nil { self.send() }
            } else { self.status = "Помилка \(code): " + ((json?["error"] as? String) ?? "код не підійшов") }
        }
    }

    // Прив'язаний iPhone: яку кімнату зараз чекає QuoteCraft?
    func checkPending(quiet: Bool = false) {
        guard let key = deviceKey, !checking else { return }
        checking = true; if !quiet { status = "Питаю QuoteCraft…" }
        post("/api/scan-pending", ["deviceKey": key]) { code, json, err in
            self.checking = false
            if let err { self.status = "Нема зв'язку: " + err.localizedDescription; return }
            if code == 401 { self.deviceKey = nil; UserDefaults.standard.removeObject(forKey: "deviceKey"); self.status = "Прив'язку скинуто — введи код з QuoteCraft ще раз."; return }
            if let t = json?["token"] as? String { self.token = t; self.sent = false; self.status = "🔗 QuoteCraft чекає скан цієї кімнати"; if self.payload != nil { self.send() } }
            else if json?["pending"] as? Bool == false { self.token = nil; self.status = "У QuoteCraft натисни «📡 Сканувати LiDAR» у кімнаті, потім тут «Перевірити»." }
            else { self.status = "Помилка \(code): " + ((json?["error"] as? String) ?? "") }
        }
    }

    func send() {
        guard let token, let payload, !sending else { return }
        sending = true
        uploadShots(token: token, i: 0, metas: []) { metas in
            var body = payload; body["photos"] = metas
            self.status = "Відправляю план…"
            self.post("/api/scan-import", ["token": token, "scan": body]) { code, json, err in
                self.sending = false
                if let err { self.status = "Помилка: " + err.localizedDescription; return }
                if code == 200 { self.sent = true; self.token = nil; self.status = "✅ Відправлено в QuoteCraft (кадрів \(metas.count)). Повернись у браузер." }
                else {
                    if code == 404 || code == 410 { self.token = nil }
                    self.status = "Помилка \(code): " + ((json?["error"] as? String) ?? "")
                }
            }
        }
    }

    // Кадри по одному (кожен ~100 КБ) → шлях у сховищі + напрямок камери
    private func uploadShots(token: String, i: Int, metas: [[String: Any]], done: @escaping ([[String: Any]]) -> Void) {
        guard i < shots.count else { done(metas); return }
        status = "Відправляю кадр \(i + 1)/\(shots.count)…"
        let s = shots[i]
        post("/api/scan-photo", ["token": token, "idx": i, "jpg": s.jpeg.base64EncodedString()]) { code, json, _ in
            var m = metas
            if code == 200, let path = json?["path"] as? String { m.append(["path": path, "cx": s.cx, "cz": s.cz, "yaw": s.yaw, "pitch": s.pitch]) }
            self.uploadShots(token: token, i: i + 1, metas: m, done: done)
        }
    }
}
