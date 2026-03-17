(function initBaiaMap(global) {
  function getBlocksLayout() {
    const config = global.BAIA_CONFIG || {};
    if (Array.isArray(config.STALL_BLOCKS) && config.STALL_BLOCKS.length) {
      return config.STALL_BLOCKS.map((block, index) => ({
        id: Number(block.id) || index + 1,
        stalls: Number(block.stalls) || 0,
      }));
    }

    const totalBlocks = Number(config.TOTAL_BLOCKS) || 1;
    const stallsPerBlock = Number(config.STALLS_PER_BLOCK) || 1;
    return Array.from({ length: totalBlocks }, (_, index) => ({
      id: index + 1,
      stalls: stallsPerBlock,
    }));
  }

  function buildStallMap({ mapElement, template, onStallClick }) {
    if (!mapElement || !template) { console.warn('[buildStallMap] mapElement ou template ausente'); return; }
    const layout = getBlocksLayout();
    mapElement.innerHTML = '';

    let counter = 1;
    layout.forEach((block, blockIndex) => {
      const blockElement = document.createElement('section');
      blockElement.className = 'block';

      const title = document.createElement('h2');
      title.className = 'block__title';
      title.textContent = `Bloco ${block.id}`;
      blockElement.appendChild(title);

      const row = document.createElement('div');
      row.className = 'stalls-row';

      for (let i = 0; i < block.stalls; i += 1) {
        const stallNumber = counter;
        counter += 1;

        const btn = template.content.firstElementChild.cloneNode(true);
        btn.dataset.stallNumber = stallNumber;
        btn.querySelector('.stall__number').textContent = String(stallNumber).padStart(3, '0');
        btn.addEventListener('click', () => onStallClick(stallNumber));
        row.appendChild(btn);
      }

      blockElement.appendChild(row);
      mapElement.appendChild(blockElement);

      if (blockIndex < layout.length - 1) {
        const corridor = document.createElement('div');
        corridor.className = 'corridor';
        corridor.textContent = 'Corredor de circulação';
        mapElement.appendChild(corridor);
      }
    });
  }

  global.BAIA_MAP = {
    getBlocksLayout,
    buildStallMap,
  };
})(window);
