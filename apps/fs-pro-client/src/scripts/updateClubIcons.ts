const fs = require('fs');
const eta = require('eta');
const path = require('path');

const d: { clubCode: string; clubName: string }[] = [];

/**
 * 1. Read the file that has the club names
 * 2. Put in an array of objects like above
 * 3. Generate the template based on the file
 * 4. Save the generated file in the output dir
 */

fs.readFile('input.txt', 'utf8', (err: any, data: any) => {
  if (err) {
    console.error(err);
    return;
  }

  data.split('\n').forEach((line: string) => {
    const l = line.split(', ');

    d.push({ clubCode: l[0].trim(), clubName: l[1].trim() });
  });
});

fs.readFile('p.eta', 'utf8', (err: any, data: any) => {
  if (err) {
    console.error(err);
    return;
  }

  const t = eta.render(data, { clubs: d });
  const filePath = path.resolve('../plugins/vuetify.ts');
  fs.writeFile(filePath, t, { flag: 'w' }, (err: any) => {
    if (err) {
      console.error(err);
    }
    // file written successfully
    console.log('updated icons successfully!');
  });
});
