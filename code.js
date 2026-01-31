// Helper to determine gap based on frame width
function getDetectedGap(nodes) {
  if (!nodes || nodes.length === 0) return 40;
  const width = nodes[0].width;
  return width > 400 ? 100 : 40;
}

// Function to handle the duplication logic
async function performDuplicate(direction, gap) {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify("⚠️ Please select at least one frame to duplicate.");
    return;
  }

  const newSelection = [];
  let autoLayoutWarning = false;
  let lastUsedEffectiveGap = 40;

  for (const node of selection) {
    const parent = node.parent;
    if (!parent) continue;

    // Logic: if gap is null, we are in auto-detect mode
    const effectiveGap = (gap !== undefined && gap !== null) ? gap : (node.width > 400 ? 100 : 40);
    lastUsedEffectiveGap = effectiveGap;

    try {
      const clone = node.clone();
      const isAutoLayout = 'layoutMode' in parent && (parent.layoutMode === 'HORIZONTAL' || parent.layoutMode === 'VERTICAL');

      if (isAutoLayout) {
        const index = parent.children.indexOf(node);
        let newIndex = index + (direction.includes('right') || direction.includes('bottom') ? 1 : 0);
        if (typeof parent.insertChild === 'function') parent.insertChild(newIndex, clone);
        else parent.appendChild(clone);
        newSelection.push(clone);
        autoLayoutWarning = true;
      } else {
        parent.appendChild(clone);
        if (direction.includes('left')) clone.x = node.x - node.width - effectiveGap;
        else if (direction.includes('right')) clone.x = node.x + node.width + effectiveGap;
        else clone.x = node.x;

        if (direction.includes('top')) clone.y = node.y - node.height - effectiveGap;
        else if (direction.includes('bottom')) clone.y = node.y + node.height + effectiveGap;
        else clone.y = node.y;

        expandSectionIfNeeded(clone);
        newSelection.push(clone);
      }
    } catch (err) {
      console.error("Error processing node:", err);
      figma.notify(`❌ Failed to duplicate: ${err.message}`, { error: true });
    }
  }

  if (newSelection.length > 0) {
    const dirLabel = direction.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
    if (autoLayoutWarning) figma.notify(`✅ Duplicated. Spacing ignored in Auto Layout.`);
    else figma.notify(`✅ Duplicated ${dirLabel} with ${lastUsedEffectiveGap}px gap.`);
  }
}

function expandSectionIfNeeded(node) {
  const parent = node.parent;
  if (!parent || parent.type !== 'SECTION' || parent.locked) return;
  const SECTION_PADDING = 80;
  const resizeParent = (w, h) => {
    if (typeof parent.resize === 'function') parent.resize(w, h);
    else if (typeof parent.resizeWithoutConstraints === 'function') parent.resizeWithoutConstraints(w, h);
  };
  if (node.x + node.width > parent.width - SECTION_PADDING) resizeParent(node.x + node.width + SECTION_PADDING, parent.height);
  if (node.y + node.height > parent.height - SECTION_PADDING) resizeParent(parent.width, node.y + node.height + SECTION_PADDING);
  if (node.x < SECTION_PADDING) {
    const shift = node.x - SECTION_PADDING;
    resizeParent(parent.width - shift, parent.height);
    parent.x += shift;
    for (const child of parent.children) if (!child.locked) child.x -= shift;
  }
  if (node.y < SECTION_PADDING) {
    const shift = node.y - SECTION_PADDING;
    resizeParent(parent.width, parent.height - shift);
    parent.y += shift;
    for (const child of parent.children) if (!child.locked) child.y -= shift;
  }
}

let isAutoDetectEnabled = true;

if (figma.command === 'open_ui' || figma.command === '') {
  figma.showUI(__html__, { width: 240, height: 350 });
  const initialGap = getDetectedGap(figma.currentPage.selection);
  figma.clientStorage.getAsync('autoDetect').then(storedAutoDetect => {
    if (storedAutoDetect !== undefined) isAutoDetectEnabled = storedAutoDetect;
    figma.clientStorage.getAsync('lastUsedGap').then(gap => {
      figma.ui.postMessage({ 
        type: 'load-settings', 
        gap: gap !== undefined ? gap : initialGap,
        autoDetect: isAutoDetectEnabled
      });
    });
  });
} else {
  figma.clientStorage.getAsync('autoDetect').then(storedAutoDetect => {
    const autoDetect = (storedAutoDetect !== undefined) ? storedAutoDetect : true;
    if (autoDetect) performDuplicate(figma.command, null).then(() => figma.closePlugin());
    else {
      figma.clientStorage.getAsync('lastUsedGap').then(gap => {
        performDuplicate(figma.command, gap !== undefined ? gap : 40).then(() => figma.closePlugin());
      });
    }
  });
}

figma.on("selectionchange", () => {
  if (isAutoDetectEnabled) {
    const gap = getDetectedGap(figma.currentPage.selection);
    figma.ui.postMessage({ type: 'update-gap', gap });
  }
});

figma.ui.onmessage = msg => {
  if (msg.type === 'resize') figma.ui.resize(Math.ceil(msg.width), Math.ceil(msg.height));
  if (msg.type === 'toggle-auto-detect') {
    isAutoDetectEnabled = msg.enabled;
    figma.clientStorage.setAsync('autoDetect', msg.enabled);
    if (isAutoDetectEnabled) figma.ui.postMessage({ type: 'update-gap', gap: getDetectedGap(figma.currentPage.selection) });
  }
  if (msg.type === 'duplicate') {
    figma.clientStorage.setAsync('lastUsedGap', msg.gap);
    figma.clientStorage.setAsync('autoDetect', msg.autoDetect);
    isAutoDetectEnabled = msg.autoDetect;
    performDuplicate(msg.direction, msg.autoDetect ? null : msg.gap);
  }
};