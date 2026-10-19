import {
  ActivityIcon,
  CalendarDaysIcon,
  ClipboardListIcon,
  EyeOffIcon,
  FileCheckIcon,
  FlagIcon,
  HistoryIcon,
  ListChecksIcon,
  LockIcon,
  MapPinIcon,
  PenLineIcon,
  RepeatIcon,
  SlidersHorizontalIcon,
  StethoscopeIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

// Conteúdo da landing, fiel ao mockup (Artifact "Landing page TechLab+ Fisio"). Só descreve o que a
// documentação do repositório registra: sem WhatsApp, aplicativo instalável, uso offline ou IA.
// Trechos entre colchetes são placeholders comerciais a preencher antes da publicação.

// A landing vive no domínio comercial (ver LANDING_HOST em src/proxy.ts); "Entrar" leva ao app.
// NEXT_PUBLIC_APP_URL sobrescreve o endereço do app em outros ambientes.
export const APP_LOGIN_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://fisio-orto-sport.vercel.app"}/login`;

// Demonstração e contato com a equipe abrem um e-mail pronto para o comercial (sem formulário nem
// serviço de envio no servidor).
export const CONTACT_EMAIL = "bruno.developer@pm.me";

const mailto = (subject: string, body: string) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const DEMO_MAILTO = mailto(
  "Demonstração do TechLab+ Fisio",
  "Olá! Quero agendar uma demonstração do TechLab+ Fisio.\n\nClínica:\nCidade:\nFisioterapeutas na equipe:\nMelhores dias e horários:\n",
);

export const TEAM_MAILTO = mailto(
  "Falar com a equipe do TechLab+ Fisio",
  "Olá! Quero falar com a equipe sobre o TechLab+ Fisio.\n\nClínica:\nPlano de interesse:\nDúvida:\n",
);

export const NAV_LINKS = [
  { href: "#produto", label: "Produto" },
  { href: "#modulos", label: "Módulos" },
  { href: "#seguranca", label: "Segurança" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
] as const;

export const HERO_PROOF = ["LGPD por padrão", "TISS 4.03 validado", "Hospedado em São Paulo"] as const;

export const STATS = [
  { value: "+1.100", label: "testes automatizados" },
  { value: "3", label: "perfis de acesso" },
  { value: "TISS 4.03.00", label: "XML validado contra XSD" },
  { value: "6 h", label: "backup com recuperação ponto a ponto" },
] as const;

export const JOURNEY: { label: string; Icon: LucideIcon }[] = [
  { label: "Paciente", Icon: UserIcon },
  { label: "Agendamento", Icon: CalendarDaysIcon },
  { label: "Avaliação inicial", Icon: StethoscopeIcon },
  { label: "Plano terapêutico", Icon: ListChecksIcon },
  { label: "Sessões", Icon: ActivityIcon },
  { label: "Evolução", Icon: PenLineIcon },
  { label: "Reavaliação", Icon: RepeatIcon },
  { label: "Alta ou continuidade", Icon: FlagIcon },
];

export const MODULES: { title: string; description: string; Icon: LucideIcon }[] = [
  {
    title: "Pacientes",
    Icon: UsersIcon,
    description:
      "Cadastro com validação de CPF, responsável legal para menores, plano de saúde com carteirinha e busca por nome que ignora acentos. Termo de consentimento, cartão de frequência e ficha de anamnese prontos para imprimir.",
  },
  {
    title: "Agenda",
    Icon: CalendarDaysIcon,
    description:
      "Visões Dia, Semana e Lista por profissional. Agendamento recorrente, reagendamento, presença e faltas na própria tela. Bloqueios, expediente e capacidade de atendimentos simultâneos por fisioterapeuta.",
  },
  {
    title: "Prontuário clínico",
    Icon: ClipboardListIcon,
    description:
      "Anamnese versionada, avaliação com ADM, força e testes especiais, plano terapêutico com revisões que não podem ser alteradas, sessões com evolução e reavaliação comparativa. Assinatura com CREFITO em cada registro.",
  },
  {
    title: "Financeiro",
    Icon: WalletIcon,
    description:
      "Cobranças por paciente, pagamentos parciais ou integrais, estornos e correções sem apagar o histórico. Relatórios de contas a receber, com vencidas, e de recebimentos por período.",
  },
  {
    title: "Convênios TISS",
    Icon: FileCheckIcon,
    description:
      "Operadoras, contratos e tarifas por vigência. Autorizações com saldo, guias SP/SADT numeradas, lotes com protocolo de envio, XML TISS 4.03 validado e conciliação de glosas item a item. Exportação em CSV.",
  },
  {
    title: "Administração",
    Icon: SlidersHorizontalIcon,
    description:
      "Perfis Administrador, Recepção e Fisioterapeuta, com a recepção sem acesso ao prontuário. Trilha de auditoria que a aplicação não consegue alterar, dados da clínica para impressões e tema claro ou escuro.",
  },
];

export const RECORD_CHECKS = [
  "Anamnese e avaliação com histórico de alterações, nunca sobrescritas.",
  "Sessão registrada direto do agendamento, marcando presença automaticamente.",
  "Reavaliação lado a lado com a avaliação inicial, terminando em continuidade, ajuste do plano ou alta.",
  "Correções com motivo registrado e assinatura CREFITO do momento.",
] as const;

export const TISS_STEPS = [
  {
    step: "Passo 1",
    title: "Lote fechado",
    code: ["Lote #0042", "18 guias SP/SADT", "Operadora: [NOME]", "Protocolo de envio: 2026101912345"],
    description: "Guias numeradas automaticamente, autorizações com saldo conferido por procedimento.",
  },
  {
    step: "Passo 2",
    title: "XML validado",
    code: ["tissLoteGuias v4.03.00", "XSD: válido", "MD5 TISS: 9f2a…c41e", "SHA-256: 3b7d…08aa"],
    description: "O arquivo exato enviado fica guardado com os dois hashes, para auditoria e reenvio.",
  },
  {
    step: "Passo 3",
    title: "Conciliação",
    code: ["16 itens pagos", "2 itens glosados", "Motivo: 1801, 2403", "Relatório: CSV · impressão"],
    description: "Recebimentos e glosas registrados por item, com relatórios por período e operadora.",
  },
] as const;

export const SECURITY: { title: string; description: string; Icon: LucideIcon }[] = [
  {
    title: "Acesso protegido",
    Icon: LockIcon,
    description: "Sessão em cookie httpOnly, senha com scrypt, limite de tentativas de login e proteção contra enumeração de contas.",
  },
  {
    title: "Nada clínico na URL",
    Icon: EyeOffIcon,
    description: "CPF e dados de prontuário nunca aparecem em endereços nem em logs. A recepção não acessa o clínico.",
  },
  {
    title: "Histórico que não se apaga",
    Icon: HistoryIcon,
    description:
      "Pacientes são inativados, nunca excluídos. Correções viram novos registros, e a auditoria fica fora do alcance da aplicação.",
  },
  {
    title: "Hospedado no Brasil",
    Icon: MapPinIcon,
    description: "Aplicação e banco PostgreSQL na região de São Paulo, com backup e recuperação ponto a ponto de 6 horas.",
  },
];

export type Plan = {
  name: string;
  price: string;
  description: string;
  features: readonly string[];
  cta: string;
  href: string;
  recommended?: boolean;
};

// Valores mensais por clínica (até 3 fisioterapeutas). Cálculo e referências de mercado em
// docs/project/19-precos-landing.md.
export const PLANS: Plan[] = [
  {
    name: "Essencial",
    price: "R$ 149",
    description: "Para a clínica que quer organizar a recepção.",
    features: [
      "Pacientes e documentos para impressão",
      "Agenda Dia, Semana e Lista",
      "Bloqueios, expediente e recorrência",
      "Perfis Administrador e Recepção",
    ],
    cta: "Falar com a equipe",
    href: TEAM_MAILTO,
  },
  {
    name: "Clínica",
    price: "R$ 299",
    description: "Para a clínica que quer prontuário e financeiro no mesmo fluxo.",
    features: [
      "Tudo do Essencial",
      "Prontuário: anamnese, avaliação, plano, sessões e reavaliação",
      "Financeiro com contas a receber e recebimentos",
      "Perfil Fisioterapeuta com assinatura CREFITO",
    ],
    cta: "Agendar demonstração",
    href: DEMO_MAILTO,
    recommended: true,
  },
  {
    name: "Convênios",
    price: "R$ 449",
    description: "Para a clínica que fatura por operadora.",
    features: [
      "Tudo do Clínica",
      "Operadoras, contratos, tarifas e autorizações",
      "Guias SP/SADT, lotes e XML TISS 4.03",
      "Conciliação de glosas e auditoria completa",
    ],
    cta: "Falar com a equipe",
    href: TEAM_MAILTO,
  },
];

export const FAQ = [
  {
    question: "Como o sistema trata os dados clínicos segundo a LGPD?",
    answer:
      "Prontuário é tratado como dado sensível. Nenhum dado clínico ou CPF vai para URL ou logs, a recepção não acessa o clínico, correções nunca apagam o registro anterior e a trilha de auditoria não pode ser alterada pela aplicação.",
  },
  {
    question: "O XML TISS já é homologado com a minha operadora?",
    answer:
      "O XML segue o padrão TISS 4.03.00 e é validado contra o XSD oficial antes de ser gerado. A homologação é feita operadora a operadora, junto com a clínica, durante a implantação.",
  },
  {
    question: "Consigo migrar o cadastro de pacientes que já tenho?",
    answer:
      "Sim. A importação do cadastro é combinada na implantação, a partir de planilha ou exportação do sistema anterior. [DETALHAR FORMATOS ACEITOS]",
  },
  {
    question: "Quais perfis de acesso existem?",
    answer:
      "Três: Administrador, que gerencia usuários, configurações e fechamento de lotes; Recepção, que cuida de pacientes, agenda e financeiro sem ver o prontuário; e Fisioterapeuta, que tem tudo isso mais o clínico de todos os pacientes.",
  },
  {
    question: "Funciona no celular?",
    answer:
      "Sim, pelo navegador. A interface se adapta a telas pequenas, inclusive a agenda, sem rolagem lateral. Não há aplicativo instalável nem uso sem internet.",
  },
] as const;

export const FOOTER_COLUMNS = [
  {
    title: "Produto",
    links: [
      { href: "#modulos", label: "Módulos" },
      { href: "#seguranca", label: "Segurança" },
      { href: "#planos", label: "Planos" },
    ],
  },
  {
    title: "Suporte",
    links: [
      { href: "#faq", label: "Perguntas frequentes" },
      { href: TEAM_MAILTO, label: "Implantação" },
      { href: TEAM_MAILTO, label: "Contato" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "#contato", label: "Privacidade" },
      { href: "#contato", label: "Termos de uso" },
      { href: "#contato", label: "LGPD" },
    ],
  },
] as const;
