(function initBaiaMap(global) {
  function getBlocksLayout() {
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

  // Gera as baias em 2 colunas verticais dentro de um elemento pai.
  // Coluna A = baias ímpares (1ª, 3ª, 5ª...), Coluna B = baias pares (2ª, 4ª, 6ª...)
  // Resultado visual: duas fileiras lado a lado, como baias reais montadas frente a frente.
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

  // Constrói o mapa completo (todos os blocos) — usado pelo organizador
  function buildStallMap({ mapElement, template, onStallClick }) {
    if (!mapElement || !template) { console.warn('[buildStallMap] mapElement ou template ausente'); return; }
    const layout = getBlocksLayout();
    mapElement.innerHTML = '';

    layout.forEach((block, blockIndex) => {
      const blockEl = document.createElement('section');
      blockEl.className = 'block';

      const title = document.createElement('h2');
      title.className = 'block__title';
      title.textContent = block.label || ('Bloco ' + block.id);
      blockEl.appendChild(title);

      buildTwoCols(blockEl, template, block.start, block.stalls, onStallClick);

      mapElement.appendChild(blockEl);

      if (blockIndex < layout.length - 1) {
        const corridor = document.createElement('div');
        corridor.className = 'corridor';
        corridor.textContent = 'Corredor de circulação';
        mapElement.appendChild(corridor);
      }
    });
  }

  // Constrói o mapa de baias de um único bloco (competidor após selecionar no mapa aéreo)
  function buildStallMapBloco({ mapElement, template, bloco, onStallClick }) {
    if (!mapElement || !template) { console.warn('[buildStallMapBloco] mapElement ou template ausente'); return; }
    mapElement.innerHTML = '';

    const blockEl = document.createElement('section');
    blockEl.className = 'block';

    const title = document.createElement('h2');
    title.className = 'block__title';
    title.textContent = bloco.label || ('Bloco ' + bloco.id);
    blockEl.appendChild(title);

    buildTwoCols(blockEl, template, bloco.start, bloco.stalls, onStallClick);

    mapElement.appendChild(blockEl);
  }

  global.BAIA_MAP = {
    getBlocksLayout,
    buildStallMap,
    buildStallMapBloco,
  };
})(window);
