type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  title?: string;
  message: string;
  duration?: number; // ms
}

class ToastManager {
  private container: HTMLDivElement | null = null;

  private getContainer(): HTMLDivElement {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
    return this.container;
  }

  public show(type: ToastType, options: ToastOptions) {
    const container = this.getContainer();
    const duration = options.duration ?? 4000;

    const card = document.createElement('div');
    card.className = 'toast-card';
    card.setAttribute('data-type', type);

    // Seleccionar icono correspondiente de Tabler Icons
    let iconClass = 'ti-info-circle';
    let defaultTitle = 'Información';
    if (type === 'success') {
      iconClass = 'ti-circle-check';
      defaultTitle = 'Éxito';
    } else if (type === 'error') {
      iconClass = 'ti-circle-x';
      defaultTitle = 'Error';
    } else if (type === 'warning') {
      iconClass = 'ti-alert-triangle';
      defaultTitle = 'Advertencia';
    }

    const titleText = options.title || defaultTitle;

    card.innerHTML = `
      <div class="toast-icon-wrapper">
        <i class="ti ${iconClass}"></i>
      </div>
      <div class="toast-content">
        <h4 class="toast-title">${this.escapeHTML(titleText)}</h4>
        <p class="toast-message">${this.escapeHTML(options.message)}</p>
      </div>
      <button class="toast-close" title="Cerrar">
        <i class="ti ti-x"></i>
      </button>
      <div class="toast-progress" style="animation-duration: ${duration}ms;"></div>
    `;

    // Botón de cerrar manual (Sileo style: click en la tarjeta para cerrar)
    card.addEventListener('click', () => {
      this.dismiss(card);
    });

    // Auto-dismiss despues del tiempo configurado
    const timeoutId = setTimeout(() => {
      this.dismiss(card);
    }, duration);

    // Guardar timeout para cancelarlo si se cierra manualmente (opcional, el navegador limpia al remover el DOM)
    card.dataset.timeoutId = timeoutId.toString();

    container.appendChild(card);
  }

  private dismiss(card: HTMLDivElement) {
    if (card.classList.contains('toast-leaving')) return;
    
    // Detener timeout si existe
    if (card.dataset.timeoutId) {
      clearTimeout(parseInt(card.dataset.timeoutId, 10));
    }

    card.classList.add('toast-leaving');
    card.addEventListener('animationend', (e) => {
      if (e.animationName === 'toast-out') {
        card.remove();
      }
    });

    // Fallback por si la animación falla
    setTimeout(() => {
      if (card.parentNode) {
        card.remove();
      }
    }, 400);
  }

  private escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Atajos
  public success(message: string, title?: string, duration?: number) {
    this.show('success', { message, title, duration });
  }

  public error(message: string, title?: string, duration?: number) {
    this.show('error', { message, title, duration });
  }

  public warning(message: string, title?: string, duration?: number) {
    this.show('warning', { message, title, duration });
  }

  public info(message: string, title?: string, duration?: number) {
    this.show('info', { message, title, duration });
  }
}

export const showToast = new ToastManager();
