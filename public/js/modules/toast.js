const DEFAULT_DURATION = 4000;
const TYPE_STYLES = {
  info: 'toast-info',
  success: 'toast-success',
  warning: 'toast-warning',
  error: 'toast-error'
};

function ensureContainer() {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

function createToastElement(message, options = {}) {
  const {
    type = 'info',
    duration = DEFAULT_DURATION,
    dismissible = true,
    actions = []
  } = options;

  const container = ensureContainer();
  const toastEl = document.createElement('div');
  toastEl.className = `toast ${TYPE_STYLES[type] || TYPE_STYLES.info}`;

  const messageEl = document.createElement('div');
  messageEl.className = 'toast-message';
  if (message instanceof Node) {
    messageEl.appendChild(message);
  } else {
    messageEl.textContent = String(message);
  }

  toastEl.appendChild(messageEl);

  if (actions.length > 0) {
    const actionsEl = document.createElement('div');
    actionsEl.className = 'toast-actions';
    actions.forEach(action => {
      const actionButton = document.createElement('button');
      actionButton.className = 'toast-action';
      actionButton.type = 'button';
      actionButton.textContent = action.label;
      if (typeof action.onClick === 'function') {
        actionButton.addEventListener('click', action.onClick);
      }
      actionsEl.appendChild(actionButton);
    });
    toastEl.appendChild(actionsEl);
  }

  if (dismissible) {
    const closeButton = document.createElement('button');
    closeButton.className = 'toast-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Dismiss notification');
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', () => dismissToast(toastEl));
    toastEl.appendChild(closeButton);
  }

  container.appendChild(toastEl);

  requestAnimationFrame(() => {
    toastEl.classList.add('toast-visible');
  });

  let timeoutId;
  if (duration > 0) {
    timeoutId = window.setTimeout(() => dismissToast(toastEl), duration);
  }

  const cancelTimeout = () => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  toastEl.addEventListener('mouseenter', cancelTimeout);
  toastEl.addEventListener('mouseleave', () => {
    if (!timeoutId && duration > 0) {
      timeoutId = window.setTimeout(() => dismissToast(toastEl), duration);
    }
  });

  return {
    element: toastEl,
    dismiss: () => dismissToast(toastEl)
  };
}

function dismissToast(toastEl) {
  if (!toastEl || toastEl.classList.contains('toast-hiding')) {
    return;
  }

  toastEl.classList.add('toast-hiding');
  toastEl.classList.remove('toast-visible');

  const removeAfterTransition = () => {
    toastEl.removeEventListener('transitionend', removeAfterTransition);
    if (toastEl.parentElement) {
      toastEl.parentElement.removeChild(toastEl);
    }
  };

  toastEl.addEventListener('transitionend', removeAfterTransition);
  window.setTimeout(removeAfterTransition, 400);
}

function showToast(message, options = {}) {
  return createToastElement(message, options);
}

function showSuccessToast(message, options = {}) {
  return showToast(message, { ...options, type: 'success' });
}

function showErrorToast(message, options = {}) {
  return showToast(message, { ...options, type: 'error' });
}

function showWarningToast(message, options = {}) {
  return showToast(message, { ...options, type: 'warning' });
}

function showInfoToast(message, options = {}) {
  return showToast(message, { ...options, type: 'info' });
}

function showConfirmToast(message, options = {}) {
  const {
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'warning'
  } = options;

  return new Promise(resolve => {
    const toast = createToastElement(message, {
      type,
      duration: 0,
      dismissible: false
    });

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'toast-actions';

    const confirmButton = document.createElement('button');
    confirmButton.className = 'toast-action toast-action-confirm';
    confirmButton.type = 'button';
    confirmButton.textContent = confirmText;
    confirmButton.addEventListener('click', () => {
      toast.dismiss();
      resolve(true);
    });

    const cancelButton = document.createElement('button');
    cancelButton.className = 'toast-action toast-action-cancel';
    cancelButton.type = 'button';
    cancelButton.textContent = cancelText;
    cancelButton.addEventListener('click', () => {
      toast.dismiss();
      resolve(false);
    });

    actionsContainer.appendChild(confirmButton);
    actionsContainer.appendChild(cancelButton);

    const { element } = toast;
    const existingActions = element.querySelector('.toast-actions');
    if (existingActions) {
      element.replaceChild(actionsContainer, existingActions);
    } else {
      const closeButton = element.querySelector('.toast-close');
      if (closeButton) {
        element.insertBefore(actionsContainer, closeButton);
      } else {
        element.appendChild(actionsContainer);
      }
    }
  });
}

const toast = {
  showToast,
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showInfoToast,
  showConfirmToast,
  dismissToast
};

if (typeof window !== 'undefined') {
  window.toast = toast;
}

export {
  showToast,
  showSuccessToast,
  showErrorToast,
  showWarningToast,
  showInfoToast,
  showConfirmToast,
  dismissToast,
  toast
};
