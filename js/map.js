(function initBaiaMap(global) {
  // Aceita layout externo (da prova no Firestore) ou usa o config.js como fallback
  function getBlocksLayout(blocos) {
    if (Array.isArray(blocos) && blocos.length) {
      return blocos.map((block, index) => ({
        id:     Number(block.id)     || index + 1,
        label:  block.label          || ('Bloco ' + (index + 1)),
        stalls: Number(block.stalls) || 0,
        start:  Number(block.start)  || 1,
      }));
    }
    const config = global.BAIA_CONFIG || {};
    if (Array.isArray(config.STALL_BLOCKS) && config.STALL_BLOCKS.length) {
      return config.STALL_BLOCKS.map((block, index) => ({
        id:     Number(block.id)     || index + 1,
        label:  block.label          || ('Bloco ' + (index + 1)),
        stalls: Number(block.stalls) || 0,
        start:  Number(block.start)  || 1,
      }));
    }
    const totalBlocks    = Number(config.TOTAL_BLOCKS)    || 1;
    const stallsPerBlock = Number(config.STALLS_PER_BLOCK)|| 1;
    return Array.from({ length: totalBlocks }, (_, index) => ({
      id:    index + 1,
      label: 'Bloco ' + (index + 1),
      stalls: stallsPerBlock,
      start: index * stallsPerBlock + 1,
    }));
  }

  // Layout HORIZONTAL — grid de linhas (usado pelo organizador)
  function buildRowLayout(parent, template, start, total, onStallClick) {
    const row = document.createElement('div');
    row.className = 'stalls-row';
    for (let i = 0; i < total; i++) {
      const stallNumber = start + i;
      const btn = template.content.firstElementChild.cloneNode(true);
      btn.dataset.stallNumber = stallNumber;
      btn.querySelector('.stall__number').textContent = String(stallNumber).padStart(3, '0');
      btn.addEventListener('click', () => onStallClick(stallNumber));
      row.appendChild(btn);
    }
    parent.appendChild(row);
  }

  // Layout VERTICAL — 2 colunas lado a lado (usado pelo competidor)
  function buildTwoCols(parent, template, start, total, onStallClick) {
    const wrap = document.createElement('div');
    wrap.className = 'stalls-two-cols';
    const colA = document.createElement('div');
    colA.className = 'stalls-col';
    const colB = document.createElement('div');
    colB.className = 'stalls-col';
    const half = Math.ceil(total / 2);
    for (let i = 0; i < total; i++) {
      const stallNumber = start + i;
      const btn = template.content.firstElementChild.cloneNode(true);
      btn.dataset.stallNumber = stallNumber;
      btn.querySelector('.stall__number').textContent = String(stallNumber).padStart(3, '0');
      btn.addEventListener('click', () => onStallClick(stallNumber));
      if (i < half) colA.appendChild(btn);
      else          colB.appendChild(btn);
    }
    wrap.appendChild(colA);
    wrap.appendChild(colB);
    parent.appendChild(wrap);
  }

  // Mapa completo em GRID HORIZONTAL — organizador
  function buildStallMap({ mapElement, template, onStallClick, blocos }) {
    if (!mapElement || !template) { console.warn('[buildStallMap] ausente'); return; }
    const layout = getBlocksLayout(blocos);
    mapElement.innerHTML = '';
    layout.forEach((block, blockIndex) => {
      const blockEl = document.createElement('section');
      blockEl.className = 'block';
      const title = document.createElement('h2');
      title.className = 'block__title';
      title.textContent = block.label || ('Bloco ' + block.id);
      blockEl.appendChild(title);
      buildRowLayout(blockEl, template, block.start, block.stalls, onStallClick);
      mapElement.appendChild(blockEl);
      if (blockIndex < layout.length - 1) {
        const corridor = document.createElement('div');
        corridor.className = 'corridor';
        corridor.textContent = 'Corredor de circulação';
        mapElement.appendChild(corridor);
      }
    });
  }

  // Mapa de um único bloco em 2 COLUNAS VERTICAIS — competidor
  function buildStallMapBloco({ mapElement, template, bloco, onStallClick, append }) {
    if (!mapElement || !template) { console.warn('[buildStallMapBloco] ausente'); return; }
    if (!append) mapElement.innerHTML = '';
    const blockEl = document.createElement('section');
    blockEl.className = 'block';
    const title = document.createElement('h2');
    title.className = 'block__title';
    title.textContent = bloco.label || ('Bloco ' + bloco.id);
    blockEl.appendChild(title);
    buildTwoCols(blockEl, template, bloco.start, bloco.stalls, onStallClick);
    mapElement.appendChild(blockEl);
  }

  // Constrói todos os blocos LADO A LADO numa grade horizontal
  // Cada bloco tem 2 colunas verticais de baias (quadradas)
  // Corredor vertical entre os blocos
  function buildStallMapVertical({ mapElement, template, onStallClick, blocos }) {
    if (!mapElement || !template) { console.warn('[buildStallMapVertical] ausente'); return; }
    const layout = getBlocksLayout(blocos);
    mapElement.innerHTML = '';

    // Container principal — todos os blocos na horizontal
    const grid = document.createElement('div');
    grid.className = 'stalls-grid-horizontal';
    mapElement.appendChild(grid);

    layout.forEach((block, blockIndex) => {
      // Bloco
      const blockEl = document.createElement('div');
      blockEl.className = 'block block--vertical';

      const title = document.createElement('h2');
      title.className = 'block__title';
      title.textContent = block.label || ('Bloco ' + block.id);
      blockEl.appendChild(title);

      buildTwoCols(blockEl, template, block.start, block.stalls, onStallClick);
      grid.appendChild(blockEl);

      // Corredor vertical entre blocos
      if (blockIndex < layout.length - 1) {
        const corridor = document.createElement('div');
        corridor.className = 'corridor corridor--vertical';
        corridor.innerHTML = '<span>Corredor</span>';
        grid.appendChild(corridor);
      }
    });
  }

  global.BAIA_MAP = {
    getBlocksLayout,
    buildStallMap,
    buildStallMapBloco,
    buildStallMapVertical,
  };
})(window);
