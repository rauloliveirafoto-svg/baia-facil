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

  // ── Normalizar blocos: todos iguais, resto vai para o último ──
  // 122 baias / 4 blocos → base=30, resto=2 → [30, 30, 30, 32]
  // 75  baias / 3 blocos → base=25, resto=0 → [25, 25, 25]
  // 200 baias / 5 blocos → base=40, resto=0 → [40, 40, 40, 40, 40]
  // 105 baias / 3 blocos → base=35, resto=0 → [35, 35, 35]
  function normalizarBlocos(layout) {
    if (layout.length === 0) return layout;

    const nBlocos = layout.length;
    const total   = layout.reduce((s, b) => s + b.stalls, 0);
    const base    = Math.floor(total / nBlocos);
    const resto   = total - base * nBlocos;

    const result = layout.map((b, i) => ({
      id:    b.id,
      label: b.label,
      // Todos os blocos com base, último recebe o resto
      stalls: i < nBlocos - 1 ? base : base + resto,
      start:  0, // recalculado abaixo
    }));

    // Recalcular starts preservando o start do primeiro bloco original
    result[0].start = layout[0].start;
    for (let i = 1; i < result.length; i++) {
      result[i].start = result[i - 1].start + result[i - 1].stalls;
    }

    return result;
  }

  // ── 2 colunas iguais por bloco ───────────────────────────────
  // Após normalização: blocos 1..N-1 sempre têm total par (base par ou ímpar acerta no resto)
  // Coluna A = Math.ceil(total/2), coluna B = Math.floor(total/2)
  // Assim colunas ficam iguais quando par, e A tem 1 a mais quando ímpar (só no último)
  function buildTwoCols(parent, template, start, total, onStallClick) {
    const wrap = document.createElement('div');
    wrap.className = 'stalls-two-cols';
    const colA = document.createElement('div');
    colA.className = 'stalls-col';
    const colB = document.createElement('div');
    colB.className = 'stalls-col';

    const colASize = Math.ceil(total / 2);

    for (let i = 0; i < total; i++) {
      const stallNumber = start + i;
      const btn = template.content.firstElementChild.cloneNode(true);
      btn.dataset.stallNumber = stallNumber;
      btn.querySelector('.stall__number').textContent = String(stallNumber).padStart(3, '0');
      btn.addEventListener('click', () => onStallClick(stallNumber));
      if (i < colASize) colA.appendChild(btn);
      else              colB.appendChild(btn);
    }
    wrap.appendChild(colA);
    wrap.appendChild(colB);
    parent.appendChild(wrap);
  }

  // buildRowLayout removida — não é usada por nenhum componente ativo

  // ── Mapa completo — organizador e competidor (mesmo layout) ──
  function buildStallMap({ mapElement, template, onStallClick, blocos }) {
    if (!mapElement || !template) { console.warn('[buildStallMap] ausente'); return; }
    const layout = normalizarBlocos(getBlocksLayout(blocos));
    mapElement.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'stalls-grid-horizontal';
    mapElement.appendChild(grid);

    layout.forEach((block, blockIndex) => {
      const blockEl = document.createElement('div');
      blockEl.className = 'block block--vertical';
      const title = document.createElement('h2');
      title.className = 'block__title';
      title.textContent = block.label || ('Bloco ' + block.id);
      blockEl.appendChild(title);
      buildTwoCols(blockEl, template, block.start, block.stalls, onStallClick);
      grid.appendChild(blockEl);

      if (blockIndex < layout.length - 1) {
        const corridor = document.createElement('div');
        corridor.className = 'corridor corridor--vertical';
        corridor.innerHTML = '<span>Corredor</span>';
        grid.appendChild(corridor);
      }
    });
  }

  // ── Mapa de um único bloco — competidor ──────────────────────
  function buildStallMapBloco({ mapElement, template, bloco, onStallClick, append }) {
    if (!mapElement || !template) { console.warn('[buildStallMapBloco] ausente'); return; }
    if (!append) mapElement.innerHTML = '';
    // Normalizar o bloco individual (não muda nada, mas mantém consistência)
    const blockEl = document.createElement('section');
    blockEl.className = 'block';
    const title = document.createElement('h2');
    title.className = 'block__title';
    title.textContent = bloco.label || ('Bloco ' + bloco.id);
    blockEl.appendChild(title);
    buildTwoCols(blockEl, template, bloco.start, bloco.stalls, onStallClick);
    mapElement.appendChild(blockEl);
  }

  // ── Todos os blocos lado a lado — mapa vertical do competidor ──
  function buildStallMapVertical({ mapElement, template, onStallClick, blocos }) {
    if (!mapElement || !template) { console.warn('[buildStallMapVertical] ausente'); return; }
    const layout = normalizarBlocos(getBlocksLayout(blocos));
    mapElement.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'stalls-grid-horizontal';
    mapElement.appendChild(grid);

    layout.forEach((block, blockIndex) => {
      const blockEl = document.createElement('div');
      blockEl.className = 'block block--vertical';
      const title = document.createElement('h2');
      title.className = 'block__title';
      title.textContent = block.label || ('Bloco ' + block.id);
      blockEl.appendChild(title);
      buildTwoCols(blockEl, template, block.start, block.stalls, onStallClick);
      grid.appendChild(blockEl);

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
    normalizarBlocos,
    buildStallMap,
    buildStallMapBloco,
    buildStallMapVertical,
  };
})(window);
