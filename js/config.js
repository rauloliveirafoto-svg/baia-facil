(function(global) {
  global.BAIA_CONFIG = {
    TOTAL_STALLS:          140,
    STALLS_PER_BLOCK:      30,   // padrão — sobrescrito por STALL_BLOCKS abaixo
    TOTAL_BLOCKS:          5,
    HOLD_DURATION_SECONDS: 300,
    // Definição detalhada dos blocos — altere aqui para cada prova
    // start: número da primeira baia do bloco (sequencial no Firebase)
    STALL_BLOCKS: [
      { id: 1, label: 'Bloco 1', stalls: 30, start: 1   },
      { id: 2, label: 'Bloco 2', stalls: 30, start: 31  },
      { id: 3, label: 'Bloco 3', stalls: 30, start: 61  },
      { id: 4, label: 'Bloco 4', stalls: 30, start: 91  },
      { id: 5, label: 'Bloco 5', stalls: 20, start: 121 },
    ],
  };
})(window);
