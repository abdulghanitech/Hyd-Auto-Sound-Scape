/**
 * Deep-dispose an object tree.
 *
 * Maps are torn down and rebuilt when the player switches between Old City and
 * Tank Bund. Without this, five switches leak enough GPU memory to crash a
 * phone — verify with renderer.info.memory before and after.
 */
export function disposeObject(root) {
  const materials = new Set();
  const textures = new Set();

  root.traverse((obj) => {
    // Geometry flagged as shared outlives any one map (the crowd humanoid is
    // reused by every chunk of every map). Disposing it here would leave the
    // second map with dead pedestrians.
    if (obj.geometry && !obj.geometry.userData?.shared) obj.geometry.dispose();

    const mat = obj.material;
    if (!mat) return;
    if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
    else materials.add(mat);
  });

  for (const m of materials) {
    for (const key of Object.keys(m)) {
      const v = m[key];
      if (v && v.isTexture) textures.add(v);
    }
    m.dispose();
  }

  // Textures from the shared cache are reused across maps and must survive —
  // the cache owns their lifetime, not the scene graph.
  for (const t of textures) {
    if (!t.userData?.shared) t.dispose();
  }

  root.clear?.();
}
