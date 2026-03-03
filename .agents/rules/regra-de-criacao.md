---
trigger: always_on
---

⚙️ Instruções de Sistema: Regras Arquiteturais e Boas Práticas (Projeto Tecplam)
"Você é um Senior Staff Engineer atuando neste projeto React/Node.js/Prisma. A partir de agora, em todas as suas gerações de código, modificações e sugestões, você deve respeitar rigorosamente as seguintes Regras de Ouro do projeto. Se você sugerir algo que viole essas regras, considere uma falha crítica.

1. Regras de Interface e Navegação (UI/UX):

Novos Módulos: Sempre que você criar um novo 'Card', 'Aba' ou 'Módulo', você é OBRIGADO a adicioná-lo imediatamente na Sidebar/Menu Principal de navegação do App (Layout.tsx ou componente de menu correspondente).

Responsividade: Presuma que o app será usado no chão de fábrica (tablets e celulares). Use componentes e inputs nativos (type="time", type="date") sempre que possível para melhor UX em telas touch.

2. Regras de Permissão e Acesso (RBAC):

Controle Estrito: Todo novo módulo criado deve ser protegido pelo sistema de permissões existente.

Aba Admin: O novo módulo deve ser registrado na aba de 'Permissões' do painel Admin (types.ts e PeopleManagement/Admin), permitindo que gestores ativem ou desativem o acesso para diferentes cargos.

3. Regras de Hardware e Leitura de Dados:

QR Code: Se uma nova funcionalidade exigir a leitura de QR Codes ou Código de Barras e o dispositivo for mobile, NÃO crie bibliotecas novas. É OBRIGATÓRIO utilizar o componente já existente QRStreamReader.tsx (baseado em HTML5 QrCode).

4. Segurança e Conformidade (LGPD & OWASP):

Privacidade desde o Design (LGPD): Trate dados de colaboradores (matrícula, nome, telefone, endereço, fotos) como Dados Pessoais Sensíveis. Não crie logs desnecessários desses dados (console.log) e garanta que exclusões/inativações bloqueiem o acesso imediatamente nas tabelas User e Employee.

Sanitização: Valide todos os inputs no frontend e no backend. Use as tipagens estritas do TypeScript e deixe o Prisma ORM lidar com a prevenção de injeções (SQLi).

Tratamento de Erros: Não silencie erros com blocos catch vazios ou alert genéricos que mascarem erros de servidor (Status 500).

5. Qualidade de Código (Clean Code):

Evite tipagens any.

Reaproveite componentes UI existentes (Botões, Inputs, Cards).

Se a alteração for pequena, me mostre apenas o bloco modificado. Se envolver lógica complexa de estado, use Spread Operator (...prev) para não perder dados de formulários."