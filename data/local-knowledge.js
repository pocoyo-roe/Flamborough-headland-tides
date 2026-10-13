// Local tidal knowledge for Flamborough Head, transcribed from the hand-drawn
// map "Flamborough Head" (with compliments D. J. Lythgoe M.B.E.).
// Hours are relative to high water at Bridlington. On this coast the flood
// runs south and the ebb runs north.
window.LOCAL_KNOWLEDGE = {
  credit: 'D. J. Lythgoe M.B.E.',
  // "The buoy" in the key is the North Smithic north cardinal buoy (VQ).
  // Approximate position; check it against a current chart.
  buoy: { name: 'N Smithic', light: 'VQ', lat: 54.1033, lon: -0.0650 },
  // Low water is listed between +5 and -5.5, so it sits at about ±6.
  key: [
    { hour: -6, label: 'Low water', text: 'Best of ebb in offing, young flood all up shore at N. Head. No tide inside from Dykes to Cattlemere Hole.' },
    { hour: -5.5, text: 'No tide at buoy, main flood inside at N. Head.' },
    { hour: -5, text: 'First of flood in Bay, Dykes to Cattlemere Hole.' },
    { hour: -4, text: 'Ebb easing away offside, good flood inside 2 mile at N. Head, good flood all over Bay.' },
    { hour: -3, text: 'Flood everywhere. Outset Sewerby to S. Landing right inside.' },
    { hour: -2, text: 'Flood full strength all over N. Head, up to 1½ hour before high water (300 yds). Outset Bridlington to Head End (just inside buoy).' },
    { hour: -1, text: 'Outset to buoy.' },
    { hour: 0, label: 'High water', text: 'Flood all over N. Head, easing inside to westward. Outset to Head End.' },
    { hour: 1, text: 'Ebb inside to N. Landing, flood all in offing.' },
    { hour: 2, text: 'Ebb all up shore to ½ mile off from Stottlebink to westward. Flood easing in offing.' },
    { hour: 2.5, text: 'Ebb eased in Silex, slack water in offing. Hive starting in Silex.' },
    { hour: 3, text: 'Ebb coming in offing (strong at Whelk Pots). Hive up to Breil (inside 10 fathoms in Silex, inside 5 fathom at Breil). Ebb Newcombe to westward.' },
    { hour: 4, text: 'Hive to Thornwick but starting to ease in Silex ready for latter ebb. Main ebb in offing, ebb easing Dykes to Cattlemere Hole inside Bay.' },
    { hour: 4.5, text: 'Slack in Silex before latter ebb.' },
    { hour: 5, text: 'Complete hive Stottlebink to Thornwick. Latter ebb stacks to Stottlebink. Best of ebb all over N. Head. Ebb from Cattlemere Hole to Head End eased at buoy.' },
    { hour: 6, label: 'Low water', text: 'Best of ebb in offing, young flood all up shore at N. Head. No tide inside from Dykes to Cattlemere Hole.' },
  ],
  glossary: [
    ['Westward', 'Towards Filey'],
    ['Inside N. Head', 'Inside the 10 fathom line'],
    ['Inside Bay', 'Up to ¼ mile off'],
    ['Offing', 'About 3 miles off at N. Head'],
    ['Offside', '3 or 4 miles off at N. Head'],
    ['Silex', 'Silex Bay (Selwicks Bay, by the lighthouse)'],
    ['Hive', 'Flood tide inside at N. Head during the ebb'],
    ['Outset', 'Ebb tide before high water ashore'],
    ['Whelk Pots', '3 miles off at Breil Newk'],
  ],
};
