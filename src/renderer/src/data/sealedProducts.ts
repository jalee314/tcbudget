import { SealedProduct } from '../types'

export const SEALED_PRODUCTS: SealedProduct[] = [
  // ─── Scarlet & Violet Base (sv1) ───────────────────────────────────────────
  { id: 'sv1-etb', name: 'Scarlet & Violet ETB', set_name: 'Scarlet & Violet', set_id: 'sv1', product_type: 'ETB', pack_count: 9, market_price: 35.00, image_url: 'https://images.pokemontcg.io/sv1/logo.png' },
  { id: 'sv1-box', name: 'Scarlet & Violet Booster Box', set_name: 'Scarlet & Violet', set_id: 'sv1', product_type: 'Booster Box', pack_count: 36, market_price: 115.00, image_url: 'https://images.pokemontcg.io/sv1/logo.png' },
  { id: 'sv1-bundle', name: 'Scarlet & Violet Booster Bundle', set_name: 'Scarlet & Violet', set_id: 'sv1', product_type: 'Booster Bundle', pack_count: 6, market_price: 20.00, image_url: 'https://images.pokemontcg.io/sv1/logo.png' },

  // ─── Paldea Evolved (sv2) ─────────────────────────────────────────────────
  { id: 'sv2-etb', name: 'Paldea Evolved ETB', set_name: 'Paldea Evolved', set_id: 'sv2', product_type: 'ETB', pack_count: 9, market_price: 37.00, image_url: 'https://images.pokemontcg.io/sv2/logo.png' },
  { id: 'sv2-box', name: 'Paldea Evolved Booster Box', set_name: 'Paldea Evolved', set_id: 'sv2', product_type: 'Booster Box', pack_count: 36, market_price: 110.00, image_url: 'https://images.pokemontcg.io/sv2/logo.png' },
  { id: 'sv2-bundle', name: 'Paldea Evolved Booster Bundle', set_name: 'Paldea Evolved', set_id: 'sv2', product_type: 'Booster Bundle', pack_count: 6, market_price: 20.00, image_url: 'https://images.pokemontcg.io/sv2/logo.png' },

  // ─── Obsidian Flames (sv3) ────────────────────────────────────────────────
  { id: 'sv3-etb', name: 'Obsidian Flames ETB', set_name: 'Obsidian Flames', set_id: 'sv3', product_type: 'ETB', pack_count: 9, market_price: 38.00, image_url: 'https://images.pokemontcg.io/sv3/logo.png' },
  { id: 'sv3-box', name: 'Obsidian Flames Booster Box', set_name: 'Obsidian Flames', set_id: 'sv3', product_type: 'Booster Box', pack_count: 36, market_price: 120.00, image_url: 'https://images.pokemontcg.io/sv3/logo.png' },
  { id: 'sv3-bundle', name: 'Obsidian Flames Booster Bundle', set_name: 'Obsidian Flames', set_id: 'sv3', product_type: 'Booster Bundle', pack_count: 6, market_price: 22.00, image_url: 'https://images.pokemontcg.io/sv3/logo.png' },

  // ─── 151 (sv3pt5) ─────────────────────────────────────────────────────────
  { id: 'sv3pt5-etb', name: '151 ETB', set_name: '151', set_id: 'sv3pt5', product_type: 'ETB', pack_count: 9, market_price: 60.00, image_url: 'https://images.pokemontcg.io/sv3pt5/logo.png' },
  { id: 'sv3pt5-box', name: '151 Booster Box', set_name: '151', set_id: 'sv3pt5', product_type: 'Booster Box', pack_count: 36, market_price: 195.00, image_url: 'https://images.pokemontcg.io/sv3pt5/logo.png' },
  { id: 'sv3pt5-bundle', name: '151 Booster Bundle', set_name: '151', set_id: 'sv3pt5', product_type: 'Booster Bundle', pack_count: 6, market_price: 35.00, image_url: 'https://images.pokemontcg.io/sv3pt5/logo.png' },

  // ─── Paradox Rift (sv4) ───────────────────────────────────────────────────
  { id: 'sv4-etb', name: 'Paradox Rift ETB', set_name: 'Paradox Rift', set_id: 'sv4', product_type: 'ETB', pack_count: 9, market_price: 36.00, image_url: 'https://images.pokemontcg.io/sv4/logo.png' },
  { id: 'sv4-box', name: 'Paradox Rift Booster Box', set_name: 'Paradox Rift', set_id: 'sv4', product_type: 'Booster Box', pack_count: 36, market_price: 115.00, image_url: 'https://images.pokemontcg.io/sv4/logo.png' },
  { id: 'sv4-bundle', name: 'Paradox Rift Booster Bundle', set_name: 'Paradox Rift', set_id: 'sv4', product_type: 'Booster Bundle', pack_count: 6, market_price: 20.00, image_url: 'https://images.pokemontcg.io/sv4/logo.png' },

  // ─── Paldean Fates (sv4pt5) ───────────────────────────────────────────────
  { id: 'sv4pt5-etb', name: 'Paldean Fates ETB', set_name: 'Paldean Fates', set_id: 'sv4pt5', product_type: 'ETB', pack_count: 9, market_price: 48.00, image_url: 'https://images.pokemontcg.io/sv4pt5/logo.png' },
  { id: 'sv4pt5-bundle', name: 'Paldean Fates Booster Bundle', set_name: 'Paldean Fates', set_id: 'sv4pt5', product_type: 'Booster Bundle', pack_count: 6, market_price: 28.00, image_url: 'https://images.pokemontcg.io/sv4pt5/logo.png' },

  // ─── Temporal Forces (sv5) ────────────────────────────────────────────────
  { id: 'sv5-etb', name: 'Temporal Forces ETB', set_name: 'Temporal Forces', set_id: 'sv5', product_type: 'ETB', pack_count: 9, market_price: 35.00, image_url: 'https://images.pokemontcg.io/sv5/logo.png' },
  { id: 'sv5-box', name: 'Temporal Forces Booster Box', set_name: 'Temporal Forces', set_id: 'sv5', product_type: 'Booster Box', pack_count: 36, market_price: 115.00, image_url: 'https://images.pokemontcg.io/sv5/logo.png' },
  { id: 'sv5-bundle', name: 'Temporal Forces Booster Bundle', set_name: 'Temporal Forces', set_id: 'sv5', product_type: 'Booster Bundle', pack_count: 6, market_price: 20.00, image_url: 'https://images.pokemontcg.io/sv5/logo.png' },

  // ─── Twilight Masquerade (sv6) ────────────────────────────────────────────
  { id: 'sv6-etb', name: 'Twilight Masquerade ETB', set_name: 'Twilight Masquerade', set_id: 'sv6', product_type: 'ETB', pack_count: 9, market_price: 40.00, image_url: 'https://images.pokemontcg.io/sv6/logo.png' },
  { id: 'sv6-box', name: 'Twilight Masquerade Booster Box', set_name: 'Twilight Masquerade', set_id: 'sv6', product_type: 'Booster Box', pack_count: 36, market_price: 125.00, image_url: 'https://images.pokemontcg.io/sv6/logo.png' },
  { id: 'sv6-bundle', name: 'Twilight Masquerade Booster Bundle', set_name: 'Twilight Masquerade', set_id: 'sv6', product_type: 'Booster Bundle', pack_count: 6, market_price: 22.00, image_url: 'https://images.pokemontcg.io/sv6/logo.png' },

  // ─── Shrouded Fable (sv6pt5) ──────────────────────────────────────────────
  { id: 'sv6pt5-etb', name: 'Shrouded Fable ETB', set_name: 'Shrouded Fable', set_id: 'sv6pt5', product_type: 'ETB', pack_count: 9, market_price: 42.00, image_url: 'https://images.pokemontcg.io/sv6pt5/logo.png' },
  { id: 'sv6pt5-bundle', name: 'Shrouded Fable Booster Bundle', set_name: 'Shrouded Fable', set_id: 'sv6pt5', product_type: 'Booster Bundle', pack_count: 6, market_price: 25.00, image_url: 'https://images.pokemontcg.io/sv6pt5/logo.png' },

  // ─── Stellar Crown (sv7) ─────────────────────────────────────────────────
  { id: 'sv7-etb', name: 'Stellar Crown ETB', set_name: 'Stellar Crown', set_id: 'sv7', product_type: 'ETB', pack_count: 9, market_price: 36.00, image_url: 'https://images.pokemontcg.io/sv7/logo.png' },
  { id: 'sv7-box', name: 'Stellar Crown Booster Box', set_name: 'Stellar Crown', set_id: 'sv7', product_type: 'Booster Box', pack_count: 36, market_price: 120.00, image_url: 'https://images.pokemontcg.io/sv7/logo.png' },
  { id: 'sv7-bundle', name: 'Stellar Crown Booster Bundle', set_name: 'Stellar Crown', set_id: 'sv7', product_type: 'Booster Bundle', pack_count: 6, market_price: 22.00, image_url: 'https://images.pokemontcg.io/sv7/logo.png' },

  // ─── Surging Sparks (sv8) ─────────────────────────────────────────────────
  { id: 'sv8-etb', name: 'Surging Sparks ETB', set_name: 'Surging Sparks', set_id: 'sv8', product_type: 'ETB', pack_count: 9, market_price: 42.00, image_url: 'https://images.pokemontcg.io/sv8/logo.png' },
  { id: 'sv8-box', name: 'Surging Sparks Booster Box', set_name: 'Surging Sparks', set_id: 'sv8', product_type: 'Booster Box', pack_count: 36, market_price: 135.00, image_url: 'https://images.pokemontcg.io/sv8/logo.png' },
  { id: 'sv8-bundle', name: 'Surging Sparks Booster Bundle', set_name: 'Surging Sparks', set_id: 'sv8', product_type: 'Booster Bundle', pack_count: 6, market_price: 25.00, image_url: 'https://images.pokemontcg.io/sv8/logo.png' },

  // ─── Prismatic Evolutions (sv8pt5) ────────────────────────────────────────
  { id: 'sv8pt5-etb', name: 'Prismatic Evolutions ETB', set_name: 'Prismatic Evolutions', set_id: 'sv8pt5', product_type: 'ETB', pack_count: 9, market_price: 90.00, image_url: 'https://images.pokemontcg.io/sv8pt5/logo.png' },
  { id: 'sv8pt5-bundle', name: 'Prismatic Evolutions Booster Bundle', set_name: 'Prismatic Evolutions', set_id: 'sv8pt5', product_type: 'Booster Bundle', pack_count: 6, market_price: 52.00, image_url: 'https://images.pokemontcg.io/sv8pt5/logo.png' },

  // ─── Journey Together (sv9) ───────────────────────────────────────────────
  { id: 'sv9-etb', name: 'Journey Together ETB', set_name: 'Journey Together', set_id: 'sv9', product_type: 'ETB', pack_count: 9, market_price: 45.00, image_url: 'https://images.pokemontcg.io/sv9/logo.png' },
  { id: 'sv9-box', name: 'Journey Together Booster Box', set_name: 'Journey Together', set_id: 'sv9', product_type: 'Booster Box', pack_count: 36, market_price: 130.00, image_url: 'https://images.pokemontcg.io/sv9/logo.png' },
  { id: 'sv9-bundle', name: 'Journey Together Booster Bundle', set_name: 'Journey Together', set_id: 'sv9', product_type: 'Booster Bundle', pack_count: 6, market_price: 25.00, image_url: 'https://images.pokemontcg.io/sv9/logo.png' },

  // ─── Evolving Skies (swsh7) ───────────────────────────────────────────────
  { id: 'swsh7-etb', name: 'Evolving Skies ETB', set_name: 'Evolving Skies', set_id: 'swsh7', product_type: 'ETB', pack_count: 8, market_price: 78.00, image_url: 'https://images.pokemontcg.io/swsh7/logo.png' },
  { id: 'swsh7-box', name: 'Evolving Skies Booster Box', set_name: 'Evolving Skies', set_id: 'swsh7', product_type: 'Booster Box', pack_count: 36, market_price: 255.00, image_url: 'https://images.pokemontcg.io/swsh7/logo.png' },
  { id: 'swsh7-bundle', name: 'Evolving Skies Booster Bundle', set_name: 'Evolving Skies', set_id: 'swsh7', product_type: 'Booster Bundle', pack_count: 6, market_price: 40.00, image_url: 'https://images.pokemontcg.io/swsh7/logo.png' },

  // ─── Fusion Strike (swsh8) ────────────────────────────────────────────────
  { id: 'swsh8-etb', name: 'Fusion Strike ETB', set_name: 'Fusion Strike', set_id: 'swsh8', product_type: 'ETB', pack_count: 8, market_price: 42.00, image_url: 'https://images.pokemontcg.io/swsh8/logo.png' },
  { id: 'swsh8-box', name: 'Fusion Strike Booster Box', set_name: 'Fusion Strike', set_id: 'swsh8', product_type: 'Booster Box', pack_count: 36, market_price: 135.00, image_url: 'https://images.pokemontcg.io/swsh8/logo.png' },

  // ─── Brilliant Stars (swsh9) ──────────────────────────────────────────────
  { id: 'swsh9-etb', name: 'Brilliant Stars ETB', set_name: 'Brilliant Stars', set_id: 'swsh9', product_type: 'ETB', pack_count: 8, market_price: 42.00, image_url: 'https://images.pokemontcg.io/swsh9/logo.png' },
  { id: 'swsh9-box', name: 'Brilliant Stars Booster Box', set_name: 'Brilliant Stars', set_id: 'swsh9', product_type: 'Booster Box', pack_count: 36, market_price: 130.00, image_url: 'https://images.pokemontcg.io/swsh9/logo.png' },
  { id: 'swsh9-bundle', name: 'Brilliant Stars Booster Bundle', set_name: 'Brilliant Stars', set_id: 'swsh9', product_type: 'Booster Bundle', pack_count: 6, market_price: 24.00, image_url: 'https://images.pokemontcg.io/swsh9/logo.png' },

  // ─── Astral Radiance (swsh10) ─────────────────────────────────────────────
  { id: 'swsh10-etb', name: 'Astral Radiance ETB', set_name: 'Astral Radiance', set_id: 'swsh10', product_type: 'ETB', pack_count: 8, market_price: 40.00, image_url: 'https://images.pokemontcg.io/swsh10/logo.png' },
  { id: 'swsh10-box', name: 'Astral Radiance Booster Box', set_name: 'Astral Radiance', set_id: 'swsh10', product_type: 'Booster Box', pack_count: 36, market_price: 120.00, image_url: 'https://images.pokemontcg.io/swsh10/logo.png' },

  // ─── Lost Origin (swsh11) ─────────────────────────────────────────────────
  { id: 'swsh11-etb', name: 'Lost Origin ETB', set_name: 'Lost Origin', set_id: 'swsh11', product_type: 'ETB', pack_count: 8, market_price: 42.00, image_url: 'https://images.pokemontcg.io/swsh11/logo.png' },
  { id: 'swsh11-box', name: 'Lost Origin Booster Box', set_name: 'Lost Origin', set_id: 'swsh11', product_type: 'Booster Box', pack_count: 36, market_price: 120.00, image_url: 'https://images.pokemontcg.io/swsh11/logo.png' },

  // ─── Silver Tempest (swsh12) ──────────────────────────────────────────────
  { id: 'swsh12-etb', name: 'Silver Tempest ETB', set_name: 'Silver Tempest', set_id: 'swsh12', product_type: 'ETB', pack_count: 8, market_price: 40.00, image_url: 'https://images.pokemontcg.io/swsh12/logo.png' },
  { id: 'swsh12-box', name: 'Silver Tempest Booster Box', set_name: 'Silver Tempest', set_id: 'swsh12', product_type: 'Booster Box', pack_count: 36, market_price: 115.00, image_url: 'https://images.pokemontcg.io/swsh12/logo.png' },

  // ─── Crown Zenith (swsh12pt5) ─────────────────────────────────────────────
  { id: 'swsh12pt5-etb', name: 'Crown Zenith ETB', set_name: 'Crown Zenith', set_id: 'swsh12pt5', product_type: 'ETB', pack_count: 8, market_price: 52.00, image_url: 'https://images.pokemontcg.io/swsh12pt5/logo.png' },

  // ─── Vivid Voltage (swsh4) ────────────────────────────────────────────────
  { id: 'swsh4-etb', name: 'Vivid Voltage ETB', set_name: 'Vivid Voltage', set_id: 'swsh4', product_type: 'ETB', pack_count: 8, market_price: 48.00, image_url: 'https://images.pokemontcg.io/swsh4/logo.png' },
  { id: 'swsh4-box', name: 'Vivid Voltage Booster Box', set_name: 'Vivid Voltage', set_id: 'swsh4', product_type: 'Booster Box', pack_count: 36, market_price: 145.00, image_url: 'https://images.pokemontcg.io/swsh4/logo.png' },

  // ─── Chilling Reign (swsh6) ───────────────────────────────────────────────
  { id: 'swsh6-etb', name: 'Chilling Reign ETB', set_name: 'Chilling Reign', set_id: 'swsh6', product_type: 'ETB', pack_count: 8, market_price: 45.00, image_url: 'https://images.pokemontcg.io/swsh6/logo.png' },
  { id: 'swsh6-box', name: 'Chilling Reign Booster Box', set_name: 'Chilling Reign', set_id: 'swsh6', product_type: 'Booster Box', pack_count: 36, market_price: 130.00, image_url: 'https://images.pokemontcg.io/swsh6/logo.png' },
]
