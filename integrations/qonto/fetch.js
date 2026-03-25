/**
 * Qonto API Integration
 * Fetches bank transactions from a Qonto account for accounting reconciliation.
 *
 * Required env vars:
 * - QONTO_ID (organization slug)
 * - QONTO_API_SECRET (secret key)
 *
 * These can be found in your Qonto dashboard under Settings > Integrations > API.
 *
 * Usage:
 *   node integrations/qonto/fetch.js
 *   node integrations/qonto/fetch.js --start 2025-01-01 --end 2025-12-31
 */

const fs = require('fs');
const path = require('path');

const QONTO_API_BASE = 'https://thirdparty.qonto.com/v2';

async function getHeaders() {
  const id = process.env.QONTO_ID;
  const secret = process.env.QONTO_API_SECRET;

  if (!id || !secret) {
    throw new Error(
      'Missing QONTO_ID or QONTO_API_SECRET environment variables.\n' +
      'Set them in your shell or .env file. You can find them in your Qonto dashboard:\n' +
      'Settings > Integrations > API.'
    );
  }

  return {
    'Authorization': `${id}:${secret}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Fetch organization info and bank accounts
 */
async function getOrganization() {
  const headers = await getHeaders();
  const response = await fetch(`${QONTO_API_BASE}/organization`, { headers });

  if (!response.ok) {
    throw new Error(`Qonto API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch transactions for a specific bank account
 * @param {string} iban - Bank account IBAN
 * @param {object} options - Query options
 * @param {string} options.status - Transaction status filter (default: 'completed')
 * @param {string} options.updated_at_from - Start date (ISO format)
 * @param {string} options.updated_at_to - End date (ISO format)
 * @param {number} options.per_page - Results per page (max 100)
 * @param {number} options.current_page - Page number
 */
async function getTransactions(iban, options = {}) {
  const headers = await getHeaders();

  const params = new URLSearchParams({
    iban,
    status: options.status || 'completed',
    per_page: String(options.per_page || 100),
    current_page: String(options.current_page || 1)
  });

  if (options.updated_at_from) {
    params.append('updated_at_from', options.updated_at_from);
  }
  if (options.updated_at_to) {
    params.append('updated_at_to', options.updated_at_to);
  }

  const url = `${QONTO_API_BASE}/transactions?${params}`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`Qonto API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch all transactions with automatic pagination
 * @param {string} iban - Bank account IBAN
 * @param {object} options - Query options (same as getTransactions)
 * @returns {Array} All transactions
 */
async function getAllTransactions(iban, options = {}) {
  const allTransactions = [];
  let currentPage = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await getTransactions(iban, {
      ...options,
      current_page: currentPage,
      per_page: 100
    });

    allTransactions.push(...result.transactions);

    const totalPages = Math.ceil(result.meta.total_count / result.meta.per_page);
    hasMore = currentPage < totalPages;
    currentPage++;

    // Rate limiting
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return allTransactions;
}

/**
 * Transform a Qonto transaction to the standard Paperasse format.
 * Output matches the format expected by data/transactions/*.json.
 */
function transformTransaction(tx) {
  return {
    id: tx.transaction_id,
    source: 'qonto',
    date: tx.settled_at || tx.emitted_at,
    amount: tx.side === 'credit' ? tx.amount : -tx.amount,
    currency: tx.currency,
    label: tx.label,
    reference: tx.reference,
    counterparty: tx.label,
    category: tx.category,
    our_category: null, // To be filled by the comptable skill during categorization
    status: tx.status,
    raw: tx
  };
}

/**
 * Main function: fetch transactions for all bank accounts and save to data/transactions/
 */
async function main() {
  // Check if Qonto is enabled in company.json
  const companyPath = path.join(__dirname, '../../company.json');
  if (fs.existsSync(companyPath)) {
    const company = JSON.parse(fs.readFileSync(companyPath, 'utf-8'));
    if (company.qonto && company.qonto.enabled === false) {
      console.log('Qonto is disabled in company.json. Skipping.');
      return;
    }
  }

  // Check env vars before making API calls
  if (!process.env.QONTO_ID || !process.env.QONTO_API_SECRET) {
    console.log('Qonto env vars (QONTO_ID, QONTO_API_SECRET) not set. Skipping.');
    console.log('To configure Qonto, set these env vars and enable qonto in company.json.');
    return;
  }

  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start' && args[i + 1]) {
      options.updated_at_from = args[i + 1];
      i++;
    } else if (args[i] === '--end' && args[i + 1]) {
      options.updated_at_to = args[i + 1];
      i++;
    }
  }

  console.log('Fetching Qonto organization info...');
  const org = await getOrganization();

  console.log(`Organization: ${org.organization.slug}`);
  console.log(`Bank accounts: ${org.organization.bank_accounts.length}`);

  const outputDir = path.join(__dirname, '../../data/transactions');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const account of org.organization.bank_accounts) {
    console.log(`\nFetching transactions for ${account.name} (${account.iban})...`);

    const transactions = await getAllTransactions(account.iban, options);
    console.log(`Found ${transactions.length} transactions`);

    const transformed = transactions.map(transformTransaction);

    const outputFile = path.join(outputDir, `qonto-${account.slug}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(transformed, null, 2));
    console.log(`Saved to ${outputFile}`);
  }

  console.log('\nDone!');
}

module.exports = {
  getOrganization,
  getTransactions,
  getAllTransactions,
  transformTransaction
};

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
