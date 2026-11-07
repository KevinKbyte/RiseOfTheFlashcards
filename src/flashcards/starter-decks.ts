// Bundled starter decks (M11, A10): playable with no import. Authored already normalized so they
// pass parseDeck unchanged; card ids are deck-prefixed because they key per-card progress.
import type { Deck } from './deck-schema.js';

const WORLD_CAPITALS: Deck = {
  id: 'world-capitals',
  title: 'World Capitals',
  cards: [
    { id: 'cap-fr', prompt: 'Capital of France?', answer: 'Paris' },
    { id: 'cap-jp', prompt: 'Capital of Japan?', answer: 'Tokyo' },
    { id: 'cap-it', prompt: 'Capital of Italy?', answer: 'Rome' },
    { id: 'cap-de', prompt: 'Capital of Germany?', answer: 'Berlin' },
    { id: 'cap-es', prompt: 'Capital of Spain?', answer: 'Madrid' },
    { id: 'cap-ca', prompt: 'Capital of Canada?', answer: 'Ottawa' },
    { id: 'cap-au', prompt: 'Capital of Australia?', answer: 'Canberra' },
    { id: 'cap-eg', prompt: 'Capital of Egypt?', answer: 'Cairo' },
    { id: 'cap-br', prompt: 'Capital of Brazil?', answer: 'Brasilia' },
    { id: 'cap-ke', prompt: 'Capital of Kenya?', answer: 'Nairobi' },
    { id: 'cap-ua', prompt: 'Capital of Ukraine?', answer: 'Kyiv', aliases: ['Kiev'] },
    { id: 'cap-ar', prompt: 'Capital of Argentina?', answer: 'Buenos Aires' },
  ],
};

const OPPOSITES: Deck = {
  id: 'opposites',
  title: 'Opposites',
  cards: [
    { id: 'opp-hot', prompt: 'Opposite of hot?', answer: 'Cold' },
    { id: 'opp-up', prompt: 'Opposite of up?', answer: 'Down' },
    { id: 'opp-big', prompt: 'Opposite of big?', answer: 'Small', aliases: ['Little'] },
    { id: 'opp-fast', prompt: 'Opposite of fast?', answer: 'Slow' },
    { id: 'opp-light', prompt: 'Opposite of light (brightness)?', answer: 'Dark' },
    { id: 'opp-open', prompt: 'Opposite of open?', answer: 'Closed', aliases: ['Shut'] },
    { id: 'opp-early', prompt: 'Opposite of early?', answer: 'Late' },
    { id: 'opp-full', prompt: 'Opposite of full?', answer: 'Empty' },
    { id: 'opp-happy', prompt: 'Opposite of happy?', answer: 'Sad' },
    { id: 'opp-wet', prompt: 'Opposite of wet?', answer: 'Dry' },
    { id: 'opp-push', prompt: 'Opposite of push?', answer: 'Pull' },
    { id: 'opp-young', prompt: 'Opposite of young?', answer: 'Old' },
  ],
};

const BASIC_SCIENCE: Deck = {
  id: 'basic-science',
  title: 'Basic Science',
  cards: [
    { id: 'sci-h2o', prompt: 'Common name for H2O?', answer: 'Water' },
    { id: 'sci-red-planet', prompt: 'Which planet is called the Red Planet?', answer: 'Mars' },
    { id: 'sci-photo', prompt: 'Process plants use to turn sunlight into food?', answer: 'Photosynthesis' },
    { id: 'sci-au', prompt: 'Chemical element with the symbol Au?', answer: 'Gold' },
    { id: 'sci-o2', prompt: 'Gas humans need to breathe to live?', answer: 'Oxygen' },
    { id: 'sci-largest-planet', prompt: 'Largest planet in our solar system?', answer: 'Jupiter' },
    { id: 'sci-pump', prompt: 'Organ that pumps blood through the body?', answer: 'Heart' },
    { id: 'sci-star', prompt: 'Star at the center of our solar system?', answer: 'The Sun', aliases: ['Sun'] },
    { id: 'sci-pull', prompt: 'Force that pulls objects toward Earth?', answer: 'Gravity' },
    { id: 'sci-co2', prompt: 'Gas plants absorb from the air?', answer: 'Carbon dioxide', aliases: ['CO2'] },
    { id: 'sci-fe', prompt: 'Chemical element with the symbol Fe?', answer: 'Iron' },
    { id: 'sci-enamel', prompt: 'Hardest substance in the human body?', answer: 'Tooth enamel', aliases: ['Enamel'] },
  ],
};

export const STARTER_DECKS: readonly Deck[] = [WORLD_CAPITALS, OPPOSITES, BASIC_SCIENCE];
