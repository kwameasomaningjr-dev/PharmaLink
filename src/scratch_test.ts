import { SearchService } from '../src/modules/availability/search.service.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  try {
    const results = await SearchService.search({ q: 'Paracetamol' });
    console.log('Search success! Count:', results.total, results.results.length);
  } catch (err) {
    console.error('Search error:', err);
  }
}

test();
