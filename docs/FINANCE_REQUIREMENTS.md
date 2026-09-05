# JR Clinic — Requisitos Canônicos do Módulo Financeiro

Este documento preserva a especificação enviada pelo cliente e deve ser tratado como a **base funcional oficial** do módulo financeiro durante o desenvolvimento em staging.

> Regra de processo: o financeiro será desenvolvido e validado em ambiente de testes antes de qualquer integração na produção da clínica.

---

Quero que o módulo financeiro seja completo, mas sem funções desnecessárias para a realidade da clínica.

Precisamos que o financeiro tenha:

## 1. ENTRADAS

• Registro automático dos valores recebidos pelos atendimentos.

• Data, cliente, profissional, serviço e forma de pagamento.

• Integração com a agenda/atendimento para evitar lançamento manual.

## 2. SAÍDAS

• Registro de todas as despesas da clínica.

• Categoria da despesa, valor, data e descrição.

## 3. CONTAS A PAGAR

• Cadastro de contas fixas e variáveis.

• Ex.: aluguel, energia, internet, fornecedores, materiais etc.

• Status: pago, pendente ou atrasado.

• Data de vencimento.

• Alertas de contas próximas do vencimento e contas atrasadas.

## 4. CONTAS A RECEBER

• Controle de valores que foram lançados e ainda não foram recebidos.

• Cadastro de clientes que ficaram de pagar posteriormente (fiado).

• Identificar cliente, valor, serviço, data e vencimento.

• Status: pendente, pago ou atrasado.

## 5. COMISSÕES DOS PROFISSIONAIS

• Percentual configurável individualmente para cada profissional.

• Ex.: profissional 50% / clínica 50%.

• Cálculo automático da comissão.

• Mostrar valor do procedimento, desconto, taxa do cartão (quando houver), valor líquido, comissão do profissional e parte da clínica.

• Permitir marcar a comissão como paga.

## 6. FECHAMENTO POR PROFISSIONAL

• Total de procedimentos realizados.

• Quantidade de atendimentos.

• Faturamento total.

• Comissão da profissional.

• Parte da clínica.

• Valores já repassados.

• Valores pendentes.

• Fechamento por período, principalmente quinzenal e mensal.

• Opção de gerar relatório/PDF.

## 7. CONTROLE DAS FORMAS DE PAGAMENTO

• Pix

• Dinheiro

• Débito

• Crédito

• Link de pagamento

• Mostrar quanto entrou em cada modalidade.

## 8. TAXAS DAS MAQUININHAS

• Cadastro das taxas por modalidade.

• Cálculo automático da taxa.

• Mostrar valor bruto, taxa e valor líquido.

## 9. DESCONTOS

• Registrar valor original.

• Percentual ou valor do desconto.

• Valor final pago.

• Identificar quem aplicou o desconto.

## 10. DASHBOARD FINANCEIRO

Quero um painel simples mostrando:

• Faturamento do dia.

• Faturamento do mês.

• Total de despesas.

• Total de comissões.

• Resultado/lucro da clínica.

• Contas pendentes.

• Contas atrasadas.

• Saldo disponível.

## 11. RELATÓRIOS

• Faturamento diário, semanal, quinzenal e mensal.

• Entradas.

• Saídas.

• Despesas por categoria.

• Comissões.

• Faturamento por profissional.

• Faturamento por serviço.

• Faturamento por forma de pagamento.

• Resultado da clínica.

• Exportação em Excel e PDF.

## 12. FILTROS

Possibilidade de filtrar por:

• Período.

• Profissional.

• Serviço.

• Forma de pagamento.

• Categoria.

• Status.

## 13. CENTRO DE CUSTOS/ÁREAS

Separar o resultado por área da clínica:

• Odontologia.

• Estética.

• Salão.

• Lash.

• Manicure/Pedicure.

• Outros.

## 14. PERMISSÕES DE ACESSO

Criar diferentes níveis de acesso:

• Administrador: acesso completo.

• Financeiro: acesso às funções financeiras.

• Recepção: registrar pagamentos e atendimentos, mas sem acesso a informações financeiras restritas.

• Profissional: visualizar somente seus próprios atendimentos, produção e comissões.

## 15. HISTÓRICO DE ALTERAÇÕES

Registrar quem criou, alterou ou excluiu um lançamento, com data e horário.

## 16. INTEGRAÇÃO COM AGENDA/ATENDIMENTO

Quando um atendimento for finalizado, o sistema deve enviar automaticamente as informações para o financeiro.

Exemplo:

Cliente → Dra. Mabel → Clareamento → R$ 600

Ao finalizar o atendimento:

• Entrada: R$ 600.

• Profissional: 50% = R$ 300.

• Clínica: 50% = R$ 300.

Se houver desconto ou taxa de cartão, o sistema deve aplicar automaticamente conforme as regras cadastradas.

## 17. ABERTURA E FECHAMENTO DE CAIXA DIÁRIO

Todo dia a recepção deve obrigatoriamente abrir e fechar o caixa.

### Abertura do caixa

• Registrar o valor inicial em dinheiro em espécie.

• Ex.: fundo de caixa inicial: R$ 200,00.

• Registrar quem abriu o caixa.

• Data e horário da abertura.

### Durante o dia, o sistema deve registrar automaticamente

• Entradas em dinheiro.

• Entradas via Pix.

• Entradas no débito.

• Entradas no crédito.

• Entradas via link.

• Saídas em dinheiro.

### Fechamento do caixa

No final do expediente, a recepção deve clicar em “Fechar Caixa”.

O sistema deve calcular:

**Fundo inicial + entradas em dinheiro − saídas em dinheiro = valor esperado em espécie**

Depois, a recepção informa o valor que foi contado fisicamente no caixa.

Exemplo:

• Fundo inicial: R$ 200,00.

• Entradas em dinheiro: R$ 500,00.

• Saídas: R$ 50,00.

• Valor esperado no caixa: R$ 650,00.

• Dinheiro contado: R$ 650,00.

• Status: ✅ Caixa conferido.

Se houver diferença:

Valor esperado: R$ 650,00

Valor contado: R$ 630,00

Diferença: - R$ 20,00

O sistema deve informar que houve uma diferença e permitir adicionar uma observação.

Também quero que fique registrado:

• Quem abriu o caixa.

• Quem fechou o caixa.

• Horário de abertura e fechamento.

• Valor inicial.

• Total recebido em dinheiro.

• Total recebido por Pix.

• Total recebido em cartão.

• Total de saídas.

• Valor esperado em espécie.

• Valor contado fisicamente.

• Diferença positiva ou negativa.

• Observação, quando houver.

Depois que o caixa for fechado, ele não deve poder ser alterado livremente. Qualquer alteração posterior precisa ficar registrada no histórico, informando quem alterou, o que foi alterado, data e horário.

Também quero conseguir consultar o fechamento de qualquer dia e gerar um relatório em PDF.

A ideia principal é que agenda, atendimentos, profissionais, serviços e financeiro conversem entre si, evitando que a equipe precise lançar a mesma informação várias vezes e reduzindo erros.

---

## Regra adicional de comissão informada pelo cliente

Quando for na parte da comissão, quero lançar manualmente, porque tem umas que é por porcentagem e outras é por valor de paciente.

Por exemplo:

- Emily é 50% de comissão.
- Aryanne ganha R$ 30 por paciente.

### Interpretação funcional aprovada

O sistema deve permitir comissão por:

- percentual;
- valor fixo por atendimento/paciente;
- ajuste/manual override quando necessário, mantendo histórico de auditoria.

A comissão não deve ser limitada a um único modelo global para toda a clínica.

---

## Regra de integração já definida no JR Clinic

O faturamento financeiro nasce apenas quando o atendimento chega ao estado **Atendido**.

Fluxo:

`Pendente -> Confirmado -> Atendido -> Financeiro`

Agendar ou confirmar um atendimento, sozinho, não deve gerar faturamento.