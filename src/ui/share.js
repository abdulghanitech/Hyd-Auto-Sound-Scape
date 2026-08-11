/* Photo mode.

   This is the actual virality mechanism, so it's worth doing properly: stamp
   the frame with the brand and the URL, then hand it to the native share sheet
   on mobile and fall back to a download on desktop.

   The canvas must be read in the same frame it was rendered — see main.js —
   which is what lets the renderer run without preserveDrawingBuffer. */

export async function capturePhoto(canvas, { fare = 0, map = "" } = {}) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92);
  });

  const stamped = await stamp(blob, { fare, map });
  const file = new File([stamped], "hyd-auto.jpg", { type: "image/jpeg" });

  const shareData = {
    files: [file],
    title: "HYD AUTO",
    text: "Gaane that only slap in a Hyderabad auto. hyd-auto.vercel.app",
  };

  if (navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (err) {
      // The user dismissing the sheet is not a failure.
      if (err?.name === "AbortError") return "cancelled";
    }
  }

  download(stamped, "hyd-auto.jpg");
  return "downloaded";
}

async function stamp(blob, { fare, map }) {
  const bitmap = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bitmap.width;
  c.height = bitmap.height;

  const g = c.getContext("2d");
  g.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pad = Math.round(c.width * 0.035);
  const scale = c.width / 1600;

  // A gradient foot so the type always reads, whatever is behind it.
  const grd = g.createLinearGradient(0, c.height - 220 * scale, 0, c.height);
  grd.addColorStop(0, "rgba(18,16,14,0)");
  grd.addColorStop(1, "rgba(18,16,14,0.82)");
  g.fillStyle = grd;
  g.fillRect(0, c.height - 220 * scale, c.width, 220 * scale);

  g.textBaseline = "alphabetic";

  g.fillStyle = "#FFF8E8";
  g.font = `800 ${Math.round(52 * scale)}px Syne, sans-serif`;
  g.textAlign = "left";
  g.fillText("HYD AUTO", pad, c.height - pad - 36 * scale);

  g.fillStyle = "rgba(255,232,186,0.78)";
  g.font = `500 ${Math.round(24 * scale)}px Figtree, sans-serif`;
  g.fillText("hyd-auto.vercel.app", pad, c.height - pad);

  g.textAlign = "right";
  g.fillStyle = "#F5C518";
  g.font = `800 ${Math.round(46 * scale)}px Syne, sans-serif`;
  g.fillText(`₹${fare}`, c.width - pad, c.height - pad - 36 * scale);

  g.fillStyle = "rgba(255,232,186,0.78)";
  g.font = `600 ${Math.round(22 * scale)}px Figtree, sans-serif`;
  g.fillText(map, c.width - pad, c.height - pad);

  return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.92));
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
