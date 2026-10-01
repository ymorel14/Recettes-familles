// Tests de l'analyse des annonces (supabase/functions/lire-annonce/analyse.ts) :
//   node --experimental-strip-types --test scripts/tester-annonce.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyserAnnonce, decoder } from '../../../supabase/functions/lire-annonce/analyse.ts';

test('gîte avec données structurées (JSON-LD)', () => {
  const html = `<html><head>
    <title>Gîte des Tilleuls - Gîtes de France</title>
    <meta property="og:image" content="https://exemple.fr/og.jpg">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"BreadcrumbList","itemListElement":[]},
      {"@type":"VacationRental","name":"G&icirc;te des Tilleuls","description":"Maison en pierre, jardin clos.",
       "image":["https://exemple.fr/photo1.jpg"],"numberOfRooms":4,"occupancy":{"@type":"QuantitativeValue","maxValue":10},
       "address":{"@type":"PostalAddress","streetAddress":"3 chemin des Prés","postalCode":"85590","addressLocality":"Les Epesses"},
       "offers":{"@type":"Offer","price":"1 250,00","priceCurrency":"EUR"}}]}</script>
  </head><body></body></html>`;
  const a = analyserAnnonce(html, 'https://www.gites-de-france.com/fr/x');
  assert.equal(a.titre, 'Gîte des Tilleuls');
  assert.equal(a.image, 'https://exemple.fr/photo1.jpg');
  assert.equal(a.ville, 'Les Epesses');
  assert.equal(a.adresse, '3 chemin des Prés, 85590 Les Epesses');
  assert.equal(a.capacite, 10);
  assert.equal(a.chambres, 4);
  assert.equal(a.prix, 1250);
  assert.equal(a.devise, 'EUR');
  assert.equal(a.genre, 'hebergement');
  assert.equal(a.site, 'gites-de-france.com');
});

test('page Open Graph seule (type Airbnb)', () => {
  const html = `<head>
    <meta property="og:title" content="Maison &amp; piscine · 8 voyageurs · 3 chambres - Airbnb">
    <meta property="og:site_name" content="Airbnb">
    <meta property="og:image" content="/images/photo.jpg">
    <meta name="description" content="Superbe maison avec piscine chauffée">
  </head>`;
  const a = analyserAnnonce(html, 'https://www.airbnb.fr/rooms/123');
  assert.equal(a.titre, 'Maison & piscine · 8 voyageurs · 3 chambres');
  assert.equal(a.image, 'https://www.airbnb.fr/images/photo.jpg');
  assert.equal(a.site, 'Airbnb');
  assert.equal(a.description, 'Superbe maison avec piscine chauffée');
  assert.equal(a.capacite, 8);
  assert.equal(a.chambres, 3);
  assert.equal(a.prix, null);
});

test('parc d’attractions et restaurant reconnus', () => {
  const parc = analyserAnnonce(
    `<script type="application/ld+json">[{"@type":"AmusementPark","name":"Puy du Fou","address":{"addressLocality":"Les Epesses"}}]</script>`,
    'https://www.puydufou.com/'
  );
  assert.equal(parc.genre, 'parc');
  assert.equal(parc.titre, 'Puy du Fou');
  const resto = analyserAnnonce(
    `<script type="application/ld+json">{"@type":["Restaurant","LocalBusiness"],"name":"Le Relais","priceRange":"€€"}</script>`,
    'https://exemple.fr/'
  );
  assert.equal(resto.genre, 'restaurant');
});

test('JSON-LD invalide ignoré, repli sur <title>', () => {
  const a = analyserAnnonce(`<title>Château de Chambord | Site officiel</title><script type="application/ld+json">{oups</script>`, 'https://www.chambord.org/');
  assert.equal(a.titre, 'Château de Chambord | Site officiel');
  assert.equal(a.genre, null);
});

test('décodage des entités', () => {
  assert.equal(decoder('L&#39;&eacute;t&eacute; &amp; la mer&nbsp;!'), "L'été & la mer !");
});
