import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService } from '../../services/api.service';
import {
  BotContext,
  ChatAction,
  ChatMessage,
  DEFAULT_QUICK_REPLIES,
  FALLBACK_REGIONS,
  FALLBACK_SPECIALIZATIONS,
  generateReply,
} from './chatbot-engine';

@Component({
  selector: 'app-chatbot',
  imports: [FormsModule],
  templateUrl: './chatbot.html',
  styleUrl: './chatbot.scss',
})
export class Chatbot {
  private api = inject(ApiService);
  private router = inject(Router);

  @ViewChild('messageList') messageListRef?: ElementRef<HTMLDivElement>;
  @ViewChild('chatInput') chatInputRef?: ElementRef<HTMLTextAreaElement>;

  open = signal(false);
  draft = signal('');
  /** Bot is composing a reply — shows the typing indicator. */
  thinking = signal(false);
  messages = signal<ChatMessage[]>([]);
  private nextId = 1;

  private regions = signal<string[]>([]);
  private specializations = signal<string[]>([]);
  private totals = signal<BotContext['totals']>(null);

  /** Quick-reply chips (pre-canned suggestions) shown when the message list is empty. */
  readonly defaultQuickReplies: ChatAction[] = DEFAULT_QUICK_REPLIES;

  hasMessages = computed(() => this.messages().length > 0);

  constructor() {
    this.loadContext();
  }

  /** Fetch live regions, specializations, and totals once — keeps replies grounded. */
  private loadContext(): void {
    forkJoin({
      regions: this.api.getHospitalRegions().pipe(catchError(() => of(FALLBACK_REGIONS))),
      doctors: this.api.getDoctors().pipe(catchError(() => of([] as { specialization: string }[]))),
      stats: this.api.getPublicStats().pipe(catchError(() => of(null))),
    }).subscribe(({ regions, doctors, stats }) => {
      this.regions.set(regions.length ? regions : FALLBACK_REGIONS);

      const specs = [...new Set(doctors.map((d) => d.specialization))].sort((a, b) => a.localeCompare(b));
      this.specializations.set(specs.length ? specs : FALLBACK_SPECIALIZATIONS);

      this.totals.set(
        stats
          ? {
              doctors: stats.total_doctors,
              hospitals: stats.total_hospitals,
              appointments: stats.total_appointments,
              regions: stats.total_regions,
            }
          : null,
      );
    });
  }

  private buildContext(): BotContext {
    return {
      isLoggedIn: this.api.isLoggedIn(),
      regions: this.regions(),
      specializations: this.specializations(),
      totals: this.totals(),
    };
  }

  togglePanel(): void {
    const next = !this.open();
    this.open.set(next);
    if (next && this.messages().length === 0) {
      // Greet the user the first time the panel opens — no LLM, just a canned welcome.
      this.appendBotMessage(
        this.api.isLoggedIn()
          ? "Hi — I'm the DocBook assistant. What would you like to do?"
          : "Hi — I'm the DocBook assistant. Tell me what kind of doctor you're looking for, or what city you're in.",
        this.defaultQuickReplies,
      );
    }
    if (next) {
      // Focus the textarea after the open animation
      setTimeout(() => this.chatInputRef?.nativeElement?.focus(), 120);
    }
  }

  closePanel(): void {
    this.open.set(false);
  }

  /** Send the current draft (typed or via Enter). */
  sendDraft(): void {
    const text = this.draft().trim();
    if (!text || this.thinking()) return;
    this.draft.set('');
    this.handleUserText(text);
  }

  /** Triggered when the user clicks a suggestion chip / quick reply. */
  onAction(action: ChatAction): void {
    if (action.kind === 'route') {
      this.navigate(action.payload);
      return;
    }
    if (action.kind === 'external') {
      window.open(action.payload, '_self');
      return;
    }
    if (action.kind === 'locate') {
      this.locateAndRoute(action.payload || undefined);
      return;
    }
    // suggest: feed the canned text back into the engine like a typed message
    this.handleUserText(action.label, action.payload);
  }

  /**
   * Use browser geolocation → backend reverse-geocode → route to /doctors with the
   * detected region (and optional specialty). All errors are explained back to the user
   * via a chat reply, never silently swallowed.
   */
  private locateAndRoute(specialty?: string): void {
    if (!navigator.geolocation) {
      this.appendBotMessage(
        "Your browser doesn't support location. Pick a city instead — I can list them.",
        [{ label: 'List cities', kind: 'suggest', payload: 'what cities do you cover' }],
      );
      return;
    }
    if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      this.appendBotMessage('Location only works over HTTPS. Pick a city instead.', [
        { label: 'List cities', kind: 'suggest', payload: 'what cities do you cover' },
      ]);
      return;
    }

    this.thinking.set(true);
    this.appendBotMessage('Asking your browser for your location…');

    const onSuccess = (pos: GeolocationPosition) => {
      this.api.reverseGeocode(pos.coords.latitude, pos.coords.longitude).subscribe({
        next: (loc) => {
          this.thinking.set(false);
          const inNetwork = this.regions().some((r) => r.toLowerCase() === loc.region.toLowerCase());
          if (inNetwork) {
            const matched = this.regions().find((r) => r.toLowerCase() === loc.region.toLowerCase())!;
            const params = new URLSearchParams({ region: matched });
            if (specialty) params.set('q', specialty);
            this.appendBotMessage(
              specialty
                ? `Detected ${matched}. Showing ${specialty} doctors there.`
                : `Detected ${matched}. Showing doctors there.`,
              [{ label: `Open doctor list in ${matched}`, kind: 'route', payload: `/doctors?${params.toString()}` }],
            );
          } else {
            this.appendBotMessage(
              `I detected "${loc.region}", but DocBook doesn't have partner hospitals there yet. Try the closest city from the list.`,
              [{ label: 'List cities', kind: 'suggest', payload: 'what cities do you cover' }],
            );
          }
        },
        error: () => {
          this.thinking.set(false);
          this.appendBotMessage(
            "I couldn't resolve your area from your coordinates. Pick a city manually and I'll filter from there.",
            [{ label: 'List cities', kind: 'suggest', payload: 'what cities do you cover' }],
          );
        },
      });
    };

    const onError = (err: GeolocationPositionError) => {
      this.thinking.set(false);
      const text =
        err.code === 1
          ? "Location permission was denied. Open your browser's site settings (lock icon next to the URL → Location → Allow), then try again."
          : err.code === 2
            ? "Your device couldn't get a position fix. Check that OS-level location is on, or pick a city manually."
            : 'Location request timed out. Try again or pick a city manually.';
      this.appendBotMessage(text, [
        { label: 'Try again', kind: 'locate', payload: specialty ?? '' },
        { label: 'List cities', kind: 'suggest', payload: 'what cities do you cover' },
      ]);
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    });
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendDraft();
    }
  }

  private handleUserText(displayText: string, engineInput?: string): void {
    this.appendUserMessage(displayText);
    this.thinking.set(true);

    // Small artificial delay so the UI feels conversational, not robotic.
    const delay = 280 + Math.min(displayText.length * 8, 320);
    setTimeout(() => {
      const reply = generateReply(engineInput ?? displayText, this.buildContext());
      this.appendBotMessage(reply.text, reply.actions);
      this.thinking.set(false);
    }, delay);
  }

  private appendUserMessage(text: string): void {
    this.pushMessage({ id: this.nextId++, role: 'user', text, ts: Date.now() });
  }

  private appendBotMessage(text: string, actions?: ChatAction[]): void {
    this.pushMessage({ id: this.nextId++, role: 'bot', text, actions, ts: Date.now() });
  }

  private pushMessage(msg: ChatMessage): void {
    this.messages.update((m) => [...m, msg]);
    queueMicrotask(() => this.scrollToBottom());
  }

  private scrollToBottom(): void {
    const el = this.messageListRef?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  /** Route navigation, supports query strings and hash fragments. */
  private navigate(payload: string): void {
    this.closePanel();
    let target = payload;
    let fragment: string | undefined;

    const hashIdx = target.indexOf('#');
    if (hashIdx >= 0) {
      fragment = target.slice(hashIdx + 1);
      target = target.slice(0, hashIdx);
    }

    const [path, query] = target.split('?');
    const queryParams: Record<string, string> = {};
    if (query) {
      for (const part of query.split('&')) {
        const [k, v] = part.split('=');
        if (k) queryParams[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
      }
    }

    this.router.navigate([path || '/'], {
      queryParams: Object.keys(queryParams).length ? queryParams : undefined,
      fragment,
    });
  }

  /** Allow the user to clear the conversation. */
  resetConversation(): void {
    this.messages.set([]);
    this.appendBotMessage(
      "Reset. What would you like to do?",
      this.defaultQuickReplies,
    );
  }
}
