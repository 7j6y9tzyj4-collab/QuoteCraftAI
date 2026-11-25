import UIKit
import VisionKit

// Сканер документів Apple (як у «Нотатках»): сам знаходить краї чека, вирівнює і обрізає.
// Повертає сторінки як JPEG (base64) — сайт обробляє їх так само, як звичайні фото чеків.
final class DocScanDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
    private let done: ([String]?, String?) -> Void
    init(done: @escaping ([String]?, String?) -> Void) { self.done = done }

    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        var pages: [String] = []
        for i in 0..<min(scan.pageCount, 6) {
            if let d = DocScanDelegate.jpeg(scan.imageOfPage(at: i)) { pages.append(d.base64EncodedString()) }
        }
        controller.dismiss(animated: true) { self.done(pages, nil) }
    }
    func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true) { self.done(nil, nil) }
    }
    func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        controller.dismiss(animated: true) { self.done(nil, error.localizedDescription) }
    }

    /// довга сторона ≤ 2000 px, JPEG ~0.72 — чек читається, а файл лишається невеликим
    static func jpeg(_ img: UIImage) -> Data? {
        let w = img.size.width * img.scale, h = img.size.height * img.scale
        let m = max(w, h)
        guard m > 0 else { return nil }
        let k = min(1, 2000 / m)
        let size = CGSize(width: (w * k).rounded(), height: (h * k).rounded())
        let fmt = UIGraphicsImageRendererFormat()
        fmt.scale = 1
        fmt.opaque = true
        let out = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
        return out.jpegData(compressionQuality: 0.72)
    }
}
