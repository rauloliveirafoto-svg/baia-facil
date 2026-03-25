(function initBaiaSelecao(global) {
  function createSelectionController(deps) {
    const {
      state,
      constants,
      ui,
      helpers,
      actions,
    } = deps;

    function hasAvailableCredits() {
      const requested = Number(state.requestedStalls) || 0;
      const configuredCredits = Number(global.BAIA_STATE.competitorCredits) || requested;
      return requested > 0 && configuredCredits > 0;
    }

    function getSuggestedSequence(stallNumber) {
      const result = [];
      const storage = actions.getState();
      if (!storage || !storage.stalls) return result;

      for (let i = 1; i <= state.requestedStalls - 1; i += 1) {
        const candidate = stallNumber + i;
        if (candidate > constants.totalStalls) continue;
        const data = storage.stalls.find((item) => item.number === candidate);
        if (data && data.status === 'available') result.push(candidate);
      }

      return result;
    }

    function toggleManualSelection(stallNumber) {
      const already = state.selectedStalls.includes(stallNumber);

      if (already) {
        state.selectedStalls = state.selectedStalls.filter((item) => item !== stallNumber);
        global.BAIA_STATE.selectedStalls = state.selectedStalls;

        actions.updateState((next) => {
          const stall = next.stalls.find((item) => item.number === stallNumber);
          if (stall && stall.status === 'selected') stall.status = 'available';
        });

        if (state.selectedStalls.length === 0) {
          actions.clearCurrentSelection();
          if (ui.feedbackEl) ui.feedbackEl.textContent = 'Seleção cancelada.';
          return;
        }
      } else {
        if (state.selectedStalls.length >= state.requestedStalls) {
          if (ui.feedbackEl) ui.feedbackEl.textContent = `Limite de ${state.requestedStalls} baias atingido.`;
          return;
        }

        actions.updateState((next) => {
          const stall = next.stalls.find((item) => item.number === stallNumber);
          if (stall && stall.status === 'available') {
            stall.status = 'selected';
            state.selectedStalls.push(stallNumber);
            global.BAIA_STATE.selectedStalls = state.selectedStalls;
          }
        });
      }

      if (ui.feedbackEl) ui.feedbackEl.textContent = `Seleção manual em andamento (${state.selectedStalls.length}/${state.requestedStalls}).`;
      // CORREÇÃO: era actions.refreshCompetitorMap() — função inexistente; correto é actions.refreshMap()
      actions.refreshMap();
    }

    function handleStallClick(stallNumber) {
      if (ui.mapSection.hidden || ui.sequenceModal.hidden === false) return;

      if (!hasAvailableCredits()) {
        if (ui.feedbackEl) ui.feedbackEl.textContent = 'Informe a quantidade de baias antes de selecionar.';
        return;
      }

      const storage = actions.getState();
      if (!storage || !storage.stalls) return;
      const stall = storage.stalls.find((item) => item.number === stallNumber);
      // Rejeitar baias que não estão disponíveis (includes selected por outro competidor)
      if (!stall || stall.status !== 'available') return;

      if (!state.mode) {
        actions.clearCurrentSelection();
        state.selectedStalls = [stallNumber];
        global.BAIA_STATE.selectedStalls = state.selectedStalls;
        state.suggestedSequence = getSuggestedSequence(stallNumber);
        state.mode = 'pending';

        actions.updateState((next) => {
          const item = next.stalls.find((s) => s.number === stallNumber);
          if (item) item.status = 'selected';
        });

        ui.sequenceList.textContent = `Baia inicial: ${helpers.formatStall(stallNumber)} | Sequência sugerida: ${state.suggestedSequence.map(helpers.formatStall).join(', ') || 'Nenhuma'}`;
        ui.sequenceModal.hidden = false;
        // Manter botão desabilitado enquanto modal de sequência está aberto
        // Será habilitado após acceptSequence() ou rejectSequence()
        ui.finishButton.disabled = true;
        actions.startTimer();
        // CORREÇÃO: era actions.refreshCompetitorMap() — função inexistente; correto é actions.refreshMap()
        actions.refreshMap();
        return;
      }

      if (state.mode === 'manual') {
        toggleManualSelection(stallNumber);
      }
    }

    function acceptSequence() {
      state.mode = 'sequence';
      ui.sequenceModal.hidden = true;
      ui.finishButton.disabled = false;

      actions.updateState((next) => {
        state.suggestedSequence.forEach((number) => {
          const stall = next.stalls.find((item) => item.number === number);
          if (stall) stall.status = 'blocked';
        });
      });

      if (ui.feedbackEl) ui.feedbackEl.textContent = 'Sequência aceita. Finalize para confirmar a reserva.';
      // CORREÇÃO: era actions.refreshCompetitorMap() — função inexistente; correto é actions.refreshMap()
      actions.refreshMap();
    }

    function rejectSequence() {
      state.mode = 'manual';
      state.suggestedSequence = [];
      ui.sequenceModal.hidden = true;
      ui.finishButton.disabled = false;
      if (ui.feedbackEl) ui.feedbackEl.textContent = `Sequência recusada. Selecione manualmente (${state.selectedStalls.length}/${state.requestedStalls}).`;
    }

    return {
      handleStallClick,
      acceptSequence,
      rejectSequence,
      // Permite atualizar o total de baias quando o bloco muda
      setTotalStalls: function(n) { constants.totalStalls = n; },
    };
  }

  global.BAIA_SELECTION = {
    createSelectionController,
  };
})(window);
