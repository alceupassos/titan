// Configuração única de navegação do cockpit — fonte de verdade tanto para a Sidebar
// (`(staff)/layout.tsx`, `(owner)/layout.tsx`) quanto para o Command Palette (⌘K,
// `components/CommandPalette.tsx`). As ~20 rotas de staff e as 6 do portal do proprietário vêm
// da seção 7.2 do prompt único — ver PROMPT_UNICO_Titan.md / prompt.md, linha ~909-930.
import type { SidebarSection } from "@titan/ui";

export const staffNavSections: SidebarSection[] = [
  {
    title: "Operação",
    items: [
      { href: "/", label: "Dia" },
      { href: "/calendario", label: "Calendário" },
      { href: "/reservas", label: "Reservas" },
      { href: "/limpeza", label: "Limpeza" },
      { href: "/limpeza/checklists", label: "Checklists" },
      { href: "/limpeza/servicos", label: "Serviços técnicos" },
      { href: "/estoque", label: "Estoque" },
      { href: "/prestadores", label: "Prestadores" },
      { href: "/equipe", label: "Equipe" },
      // Fase 9, Passo 4b (docs/fase-atual.md): escala e custódia de acesso — sub-rota da visão
      // geral de Equipe acima, nunca a substitui. A PRÓXIMA FAIXA (produtividade, Passo 4c, que
      // edita este arquivo em seguida) adiciona `{ href: "/equipe/produtividade", label:
      // "Produtividade" }` logo ABAIXO desta linha — não a remova nem a reordene ao reconciliar.
      { href: "/equipe/escala", label: "Escala" },
      // Fase 9, Passo 4c: painel de produtividade (contagem de tarefas concluídas + sinalização de
      // possível reuso de evidência entre tarefas do mesmo membro) — sub-rota da visão geral de
      // Equipe acima, nunca a substitui.
      { href: "/equipe/produtividade", label: "Produtividade" },
    ],
  },
  {
    title: "Comercial",
    items: [
      { href: "/tarifas", label: "Tarifas" },
      { href: "/pricing", label: "Pricing" },
      { href: "/distribuicao", label: "Distribuição" },
      { href: "/inbox", label: "Inbox" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/financeiro", label: "Financeiro" },
      { href: "/financeiro/dre", label: "DRE" },
      { href: "/fiscal", label: "Fiscal" },
      { href: "/repasses", label: "Repasses" },
      { href: "/aprovacoes", label: "Aprovações" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/automacao", label: "Automação" },
      { href: "/config", label: "Configurações" },
    ],
  },
];

export const ownerNavSections: SidebarSection[] = [
  {
    title: "Portal do proprietário",
    items: [
      { href: "/portal", label: "Visão geral" },
      { href: "/portal/extratos", label: "Extratos" },
      { href: "/portal/fiscal", label: "Fiscal" },
      { href: "/portal/bloqueios", label: "Bloqueios" },
      { href: "/portal/documentos", label: "Documentos" },
    ],
  },
];

// Fase 7, Passo 4a (docs/fase-atual.md): Portal do prestador (apps/console/app/(vendor)/**).
// Decisão de nomenclatura (route group `(vendor)`, não `/portal/*`): o Owner Portal já ocupa
// `/portal/*` desde a Fase 5 acima. Route groups do Next.js (`(owner)/`, `(vendor)/`) NÃO
// adicionam segmento à URL — só agrupam rotas/layouts sem aparecer no caminho. Se o portal do
// prestador também vivesse em `(vendor)/portal/*`, colidiria literalmente com `(owner)/portal/*`
// na mesma URL "/portal". Por isso as rotas do prestador vivem em `/portal-prestador/*` — ver
// apps/console/app/(vendor)/portal-prestador/**.
export const vendorNavSections: SidebarSection[] = [
  {
    title: "Portal do prestador",
    items: [
      { href: "/portal-prestador", label: "Minhas OS" },
      { href: "/portal-prestador/pagamentos", label: "Pagamentos" },
    ],
  },
];

/** Todas as seções — usado pelo Command Palette, que busca em cockpit e portais ao mesmo tempo. */
export const allNavSections: SidebarSection[] = [...staffNavSections, ...ownerNavSections, ...vendorNavSections];
