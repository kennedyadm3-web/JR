// soundService.ts - Gerenciador de Alertas Sonoros para Notificações do Sistema

const SOUND_STORAGE_KEY = 'notification_sound_enabled';
const VOLUME_STORAGE_KEY = 'notification_sound_volume';

class SoundService {
  private audioCtx: AudioContext | null = null;
  private isUnlocked: boolean = false;
  private listenersAttached: boolean = false;

  constructor() {
    // Inicialização segura para ambientes com window/browser
    if (typeof window !== 'undefined') {
      this.attachUnlockListeners();
    }
  }

  /**
   * Garante que o AudioContext seja criado e esteja ativo
   */
  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {
        // Aguardando interação do usuário caso bloqueado pela autoplay policy
      });
    }

    return this.audioCtx;
  }

  /**
   * Adiciona listeners para desbloquear o áudio no primeiro clique/toque do usuário
   */
  public attachUnlockListeners() {
    if (this.listenersAttached || typeof window === 'undefined') return;
    this.listenersAttached = true;

    const unlock = () => {
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().then(() => {
          this.isUnlocked = true;
        }).catch(() => {});
      } else if (ctx && ctx.state === 'running') {
        this.isUnlocked = true;
      }

      // Remove os listeners após a primeira interação
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('click', unlock, { once: true, passive: true });
    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
  }

  /**
   * Verifica se o som de notificação está habilitado
   */
  public isSoundEnabled(): boolean {
    if (typeof window === 'undefined') return true;
    try {
      const stored = localStorage.getItem(SOUND_STORAGE_KEY);
      // Por padrão é habilitado (true), a menos que explicitamente desligado
      return stored !== 'false';
    } catch {
      return true;
    }
  }

  /**
   * Altera a preferência de som de notificação
   */
  public setSoundEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('Não foi possível salvar preferência de som no localStorage:', e);
    }
  }

  /**
   * Obtém o volume configurado (entre 0.1 e 1.0)
   */
  public getVolume(): number {
    if (typeof window === 'undefined') return 0.7;
    try {
      const stored = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (stored) {
        const val = parseFloat(stored);
        if (!isNaN(val) && val >= 0.05 && val <= 1.0) return val;
      }
    } catch {}
    return 0.7; // Padrão 70%
  }

  /**
   * Define o volume das notificações
   */
  public setVolume(volume: number): void {
    if (typeof window === 'undefined') return;
    try {
      const safeVolume = Math.min(Math.max(volume, 0.05), 1.0);
      localStorage.setItem(VOLUME_STORAGE_KEY, safeVolume.toString());
    } catch {}
  }

  /**
   * Toca o tom sonoro de notificação se o som estiver habilitado
   */
  public playNotificationSound(): void {
    if (!this.isSoundEnabled()) return;
    this.playChime(this.getVolume());
  }

  /**
   * Toca o tom sonoro mesmo que o som esteja desativado (para testes no painel de configurações)
   */
  public testNotificationSound(customVolume?: number): void {
    const volume = customVolume !== undefined ? customVolume : this.getVolume();
    this.playChime(volume);
  }

  /**
   * Gera um chime suave, profissional e elegante via síntese Web Audio API.
   * Não depende de download de arquivos externos mp3/wav, funcionando 100% offline e com latência zero.
   */
  private playChime(masterVolume: number): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        this.synthesizeChime(ctx, masterVolume);
      }).catch(err => {
        console.warn('Áudio bloqueado pelo navegador até interação do usuário:', err);
      });
    } else {
      this.synthesizeChime(ctx, masterVolume);
    }
  }

  /**
   * Síntese de 3 tons harmônicos ascendentes (Mi5 -> Lá5 -> Dó#6) com decaimento suave estilo sino/chime executivo
   */
  private synthesizeChime(ctx: AudioContext, masterVolume: number): void {
    try {
      const now = ctx.currentTime;
      const vol = Math.max(0.05, Math.min(masterVolume, 1.0));

      // Master Gain para controlar o volume geral com envelope de segurança
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(vol * 0.45, now);
      masterGain.connect(ctx.destination);

      // Notas do chime de alerta:
      // Nota 1: 587.33 Hz (D5) - toque inicial sutil
      // Nota 2: 880.00 Hz (A5) - tom principal de atenção
      // Nota 3: 1174.66 Hz (D6) - brilho cristalino final
      const notes = [
        { freq: 587.33, start: 0.0, duration: 0.22, type: 'sine' as OscillatorType, peakGain: 0.8 },
        { freq: 880.00, start: 0.09, duration: 0.38, type: 'sine' as OscillatorType, peakGain: 1.0 },
        { freq: 1174.66, start: 0.18, duration: 0.55, type: 'triangle' as OscillatorType, peakGain: 0.6 }
      ];

      notes.forEach(({ freq, start, duration, type, peakGain }) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + start);

        // Envelope ADSR suave (evita estalos ou cliques)
        const noteStart = now + start;
        const noteEnd = noteStart + duration;

        noteGain.gain.setValueAtTime(0.0001, noteStart);
        // Ataque rápido de 18ms
        noteGain.gain.exponentialRampToValueAtTime(peakGain, noteStart + 0.018);
        // Decaimento exponencial suave (reverb-like)
        noteGain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

        osc.connect(noteGain);
        noteGain.connect(masterGain);

        osc.start(noteStart);
        osc.stop(noteEnd + 0.05);
      });
    } catch (e) {
      console.warn('Erro ao reproduzir alerta sonoro de notificação:', e);
    }
  }
}

export const soundService = new SoundService();
export default soundService;
