// Outbound notice templates. One definition drives all three outputs, so
// they can't drift apart:
//   - `text`  : full rendered message (SMS body + on-screen preview)
//   - `params`: ordered values for the WhatsApp template's {{1}}..{{n}}
//   - `whatsappBody`: the exact body to register in WhatsApp Manager
//
// Wording is a starting point - have it reviewed against the pledge
// agreement and your state's pawnbroker rules before going live.

const formatINR = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const formatDateIN = (iso) => {
  if (!iso) return '-';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};

function describeItems(items) {
  const list = (items || []).map((i) => [i.purity, i.metal_type, i.item_type].filter(Boolean).join(' '));
  return list.length ? list.join(', ') : 'ornaments';
}

function totalWeight(items) {
  const g = (items || []).reduce((n, i) => n + (Number(i.net_weight ?? i.gross_weight) || 0), 0);
  return g ? g.toFixed(2) : '-';
}

export const TEMPLATES = {
  auction_notice: {
    label: 'Overdue - auction notice',
    // Default WhatsApp template name; override with WHATSAPP_TEMPLATE_AUCTION_NOTICE.
    whatsappTemplateEnv: 'WHATSAPP_TEMPLATE_AUCTION_NOTICE',
    whatsappTemplateDefault: 'loan_auction_notice',
    whatsappBody:
      'Dear {{1}}, this is a notice from {{2}}, {{3}}. You have pledged {{4}} (net weight {{5}} g) with us against a loan of Rs. {{6}} taken on {{7}} (Loan No. {{8}}). Please pay the interest due or close the loan within {{9}} days of this notice. If it is not paid, the pledged ornaments will be auctioned as per the terms of your pledge agreement. For details please contact {{10}}.',
    params({ business, borrower, loan, noticeDays }) {
      return [
        borrower?.name || 'Customer',
        business.legal_name,
        business.address || '-',
        describeItems(loan.loan_items),
        totalWeight(loan.loan_items),
        formatINR(loan.loan_amount),
        formatDateIN(loan.loan_date),
        loan.loan_number,
        String(noticeDays),
        business.phone || business.trade_name || business.legal_name,
      ];
    },
  },
};

export const DEFAULT_NOTICE_DAYS = 15;

export function renderTemplate(key, context) {
  const template = TEMPLATES[key];
  if (!template) throw new Error(`Unknown template "${key}"`);
  const params = template.params(context);
  const text = template.whatsappBody.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? '');
  const whatsappTemplateName = process.env[template.whatsappTemplateEnv] || template.whatsappTemplateDefault;
  return { text, params, whatsappTemplateName };
}
