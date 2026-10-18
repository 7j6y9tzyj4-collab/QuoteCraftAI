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
    var cloud: Data? = nil
    var mesh: Data? = nil
    var frames: [KeyFrame] = []
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
          self.uploadCloud(token: token) { cloudInfo in
           self.uploadMesh(token: token) { meshInfo in
            var body = payload; body["photos"] = metas
            if let cloudInfo { body["cloud"] = cloudInfo }
            if let meshInfo { body["mesh"] = meshInfo }
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
        }
    }

    // Великий файл → напряму в сховище за одноразовим посиланням (минаючи ліміт сервера) → шлях
    private func putSigned(token: String, name: String, data: Data, type: String, done: @escaping (String?) -> Void) {
        post("/api/scan-cloud-url", ["token": token, "name": name]) { code, json, _ in
            guard code == 200, let up = json?["uploadUrl"] as? String, let path = json?["path"] as? String, let url = URL(string: up) else { done(nil); return }
            var req = URLRequest(url: url)
            req.httpMethod = "PUT"; req.timeoutInterval = 300
            req.setValue(type, forHTTPHeaderField: "Content-Type")
            req.setValue("true", forHTTPHeaderField: "x-upsert")
            if let k = json?["apikey"] as? String, !k.isEmpty { req.setValue(k, forHTTPHeaderField: "apikey") }
            URLSession.shared.uploadTask(with: req, from: data) { _, resp, _ in
                let ok = ((resp as? HTTPURLResponse)?.statusCode ?? 0) == 200
                DispatchQueue.main.async { done(ok ? path : nil) }
            }.resume()
        }
    }
    // 3D-скан (хмара точок)
    private func uploadCloud(token: String, done: @escaping ([String: Any]?) -> Void) {
        guard let cloud, cloud.count > 8 else { done(nil); return }
        status = String(format: "Відправляю 3D-точки (%.1f МБ)…", Double(cloud.count) / 1_000_000)
        putSigned(token: token, name: "cloud", data: cloud, type: "application/octet-stream") { path in
            done(path.map { ["path": $0, "n": (cloud.count - 8) / 9] })
        }
    }
    // 3D-фото: сітка + ключові кадри (по одному)
    private func uploadMesh(token: String, done: @escaping ([String: Any]?) -> Void) {
        guard let mesh, mesh.count > 12, !frames.isEmpty else { done(nil); return }
        status = String(format: "Відправляю 3D-сітку (%.1f МБ)…", Double(mesh.count) / 1_000_000)
        putSigned(token: token, name: "mesh", data: mesh, type: "application/octet-stream") { meshPath in
            guard let meshPath else { done(nil); return }
            self.uploadFrames(token: token, i: 0, metas: []) { metas in
                done(metas.isEmpty ? nil : ["path": meshPath, "frames": metas])
            }
        }
    }
    private func uploadFrames(token: String, i: Int, metas: [[String: Any]], done: @escaping ([[String: Any]]) -> Void) {
        guard i < frames.count else { done(metas); return }
        status = "Відправляю 3D-фото \(i + 1)/\(frames.count)…"
        let f = frames[i]
        putSigned(token: token, name: "kf-\(i)", data: f.jpeg, type: "image/jpeg") { path in
            var m = metas
            if let path { m.append(["path": path, "T": f.T, "fx": f.fx, "fy": f.fy, "cx": f.cx, "cy": f.cy, "w": f.w, "h": f.h]) }
            self.uploadFrames(token: token, i: i + 1, metas: m, done: done)
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
