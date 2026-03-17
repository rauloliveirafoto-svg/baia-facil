(function initBaiaState(global) {
  const holdSeconds = global.BAIA_CONFIG?.HOLD_DURATION_SECONDS ?? 300;

  const state = {
    // Estado global solicitado
    stalls: [],
    selectedStalls: [],
    competitorCredits: 0,
    formData: {
      holderName: '',
      requestedStalls: 0,
      contactPhone: '',
    },
    timer: {
      isActive: false,
      remainingSeconds: holdSeconds,
    },
    reservation: {
      status: 'inactive', // inactive | active | finalized
    },

    // Estado de apoio por página (sem alterar comportamento)
    competitor: {
      holderName: '',
      requestedStalls: 0,
      contactPhone: '',
      selectedStalls: [],
      suggestedSequence: [],
      mode: null,
      timerId: null,
      remainingSeconds: holdSeconds,
      receipt: null,
    },
    organizer: {
      selectedStallNumber: null,
    },
  };

  global.BAIA_STATE = state;
})(window);
