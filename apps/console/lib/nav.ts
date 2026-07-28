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

/** Todas as seções — usado pelo Command Palette, que busca em cockpit e portal ao mesmo tempo. */
export const allNavSections: SidebarSection[] = [...staffNavSections, ...ownerNavSections];
