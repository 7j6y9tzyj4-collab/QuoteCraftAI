import ExpoModulesCore
import SwiftUI
import UIKit
import RoomPlan
import VisionKit

// Вбудований LiDAR-сканер: QuoteCraft (сайт у WebView) створює заявку з токеном → застосунок відкриває сканер →
// після «Готово» план, кадри й 3D-точки самі відправляються на сервер за цим токеном. Окремий застосунок і код не потрібні.
public final class QcScanModule: Module {
  private var docDelegate: DocScanDelegate?

  public func definition() -> ModuleDefinition {
    Name("QcScan")

    Function("isSupported") { () -> Bool in
      if #available(iOS 17.0, *) { return RoomCaptureSession.isSupported }
      return false
    }

    // сканер чеків/документів з автообрізанням країв
    AsyncFunction("scanDocument") { (promise: Promise) in
      DispatchQueue.main.async {
        self.presentDocScan(promise: promise)
      }
    }

    AsyncFunction("scan") { (token: String, api: String, promise: Promise) in
      DispatchQueue.main.async {
        self.present(token: token, api: api, promise: promise)
      }
    }
  }

  @MainActor
  private func presentDocScan(promise: Promise) {
    guard VNDocumentCameraViewController.isSupported else {
      promise.resolve(["ok": false, "message": "unsupported", "pages": [String]()] as [String: Any])
      return
    }
    guard let top = appContext?.utilities?.currentViewController() else {
      promise.resolve(["ok": false, "message": "no-view", "pages": [String]()] as [String: Any])
      return
    }
    let delegate = DocScanDelegate { [weak self] pages, error in
      self?.docDelegate = nil
      if let pages {
        promise.resolve(["ok": true, "message": "", "pages": pages] as [String: Any])
      } else {
        promise.resolve(["ok": false, "message": error ?? "cancelled", "pages": [String]()] as [String: Any])
      }
    }
    docDelegate = delegate
    let vc = VNDocumentCameraViewController()
    vc.delegate = delegate
    vc.modalPresentationStyle = .fullScreen
    top.present(vc, animated: true, completion: nil)
  }

  @MainActor
  private func present(token: String, api: String, promise: Promise) {
    guard #available(iOS 17.0, *), RoomCaptureSession.isSupported else {
      promise.resolve(["ok": false, "message": "unsupported"] as [String: Any])
      return
    }
    guard let top = appContext?.utilities?.currentViewController() else {
      promise.resolve(["ok": false, "message": "no-view"] as [String: Any])
      return
    }
    let flow = ScanFlow(token: token, api: api)
    var finished = false
    let host = UIHostingController(rootView: ScanFlowView(flow: flow) { ok, message in
      if finished { return }
      finished = true
      top.dismiss(animated: true) {
        promise.resolve(["ok": ok, "message": message] as [String: Any])
      }
    })
    host.modalPresentationStyle = .fullScreen
    top.present(host, animated: true, completion: nil)
  }
}
