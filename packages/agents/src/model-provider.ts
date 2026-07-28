// Porta do provedor de modelo (seção 9.12 do prompt único). Redução de escopo deliberada da
// Fase 10: sem conta/chave de API de LLM configurada nesta máquina (mesma classe de gap de todas
// as fases anteriores — gateway de pagamento, provedor fiscal, dado de pricing licenciado).
// `AgentModelProvider` é a porta REAL — um adapter de LLM de verdade se pluga aqui quando houver
// credencial; o único adapter fornecido nesta fase (`RuleBasedModelProvider`) é determinístico
// (classificação de intenção por palavra-chave, resposta por template), suficiente para o
// golden-set e o corpus de injeção provarem o MECANISMO estrutural, nunca fingido como NLU real.
export type AgentIntent =
  | "greeting"
  | "check_in_info"
  | "wifi_password"
  | "checkout_time"
  | "amenity_question"
  | "urgent_issue"
  | "unknown";

export interface AgentMessage {
  readonly role: "user" | "agent" | "tool";
  readonly content: string;
  /** Conteúdo vindo do hóspede/canal externo é sempre `trusted: false` — guardrail #1 do ADR-0009
   * (instância que ingere conteúdo não confiável nunca tem ferramenta de escrita) depende deste
   * campo para decidir se uma ferramenta de escrita pode ser oferecida nesta conversa. */
  readonly trusted: boolean;
}

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface AgentCompletion {
  readonly intent: AgentIntent;
  readonly responseText: string;
  readonly usage: TokenUsage;
  /** Nome da ferramenta que o modelo pediu para chamar, se houver — `null` quando a resposta é
   * só texto. O CHAMADOR (nunca este provider) decide se a ferramenta pedida é permitida nesta
   * conversa, via `guardrails.ts`. */
  readonly requestedTool: string | null;
}

export interface AgentModelProvider {
  complete(messages: readonly AgentMessage[]): Promise<AgentCompletion>;
}

/** Palavras-chave -> intenção, primeira correspondência vence (ordem da lista importa). Tabela
 * literal em vez de arquivo de configuração versionado porque é o "prompt"/"modelo" desta
 * heurística — trocar por um LLM real substituiria esta lista inteira, não um valor dela (ao
 * contrário de alíquota/retenção, que são dado de negócio versionado por vigência). */
const INTENT_KEYWORDS: ReadonlyArray<{ intent: AgentIntent; keywords: readonly string[] }> = [
  { intent: "urgent_issue", keywords: ["emergência", "urgente", "vazamento", "incêndio", "socorro"] },
  { intent: "wifi_password", keywords: ["wifi", "wi-fi", "senha da internet", "senha do wifi"] },
  { intent: "check_in_info", keywords: ["check-in", "checkin", "chegada", "que horas chego"] },
  { intent: "checkout_time", keywords: ["checkout", "check-out", "saída", "que horas saio"] },
  { intent: "amenity_question", keywords: ["piscina", "academia", "estacionamento", "ar condicionado"] },
  { intent: "greeting", keywords: ["oi", "olá", "bom dia", "boa tarde", "boa noite"] },
];

const RESPONSE_TEMPLATE: Record<AgentIntent, string> = {
  greeting: "Olá! Sou o Concierge da Titan Stay. Como posso ajudar?",
  check_in_info: "O check-in é a partir das 15h. Posso te enviar as instruções de acesso.",
  wifi_password: "A senha do Wi-Fi está no manual da casa, na mesa da sala.",
  checkout_time: "O checkout é até as 11h. Precisa de late checkout?",
  amenity_question: "Deixa eu confirmar essa informação sobre as comodidades da unidade.",
  urgent_issue: "Entendi a urgência — vou escalar isso agora para a equipe humana.",
  unknown: "Não tenho certeza se entendi — pode reformular ou prefere falar com um humano?",
};

function classifyIntent(text: string): AgentIntent {
  const normalized = text.toLowerCase();
  for (const { intent, keywords } of INTENT_KEYWORDS) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return intent;
    }
  }
  return "unknown";
}

/** Estimativa determinística de tokens — 1 token ≈ 4 caracteres (heurística grosseira comum para
 * português/inglês misto), documentada como aproximação, nunca o tokenizador real de um modelo
 * específico (que dependeria do provedor real, ainda não plugado). */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Adapter determinístico de `AgentModelProvider` — classifica a última mensagem do usuário por
 * palavra-chave e responde por template. Nunca chama uma API externa. `requestedTool` só é
 * preenchido para `urgent_issue` (pede `create_approval_request` — escalar para humano é a única
 * "ferramenta" que este provider de exemplo solicita).
 */
export class RuleBasedModelProvider implements AgentModelProvider {
  async complete(messages: readonly AgentMessage[]): Promise<AgentCompletion> {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const intent = lastUserMessage ? classifyIntent(lastUserMessage.content) : "unknown";
    const responseText = RESPONSE_TEMPLATE[intent];

    const promptTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const completionTokens = estimateTokens(responseText);

    return {
      intent,
      responseText,
      usage: { promptTokens, completionTokens },
      requestedTool: intent === "urgent_issue" ? "create_approval_request" : null,
    };
  }
}
