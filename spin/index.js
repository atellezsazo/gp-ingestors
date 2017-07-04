'use strict';

const Promise = require("bluebird");
const libingester = require('libingester');
//const url = require('url');

const URI_NEWS='http://www.spin.ph/news'; //News
const URI_REPORTS='';
const URI_LIFESTYLE='';
const URI_OPINION='';
const URI_MULTIMEDIA='';


const CATEGORY_LINKS = [
    'http://www.spin.ph/news',
    'http://www.spin.ph/special-reports', //Special Reports
    'http://www.spin.ph/active-lifestyle', //bidi bidi bong
    'http://www.spin.ph/sports/opinion', //Opinion
    'http://www.spin.ph/multimedia' //Multimedia
];

/** delete duplicated elements in array **/
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

// max number of links per category
const MAX_LINKS = 5;

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {

    //      console.log('AQUI --> '+uri);

    }).catch(err => {
        if (err.code == 'ECONNRESET') return ingest_article(hatch, uri);
    });
}


function main() {
    const hatch = new libingester.Hatch('spin', 'en');

    const get_all_links = () => {
        let all_links = [];
        return Promise.all(
            CATEGORY_LINKS.map(link => libingester.util.fetch_html(link).then($ => {
                let links = $('.thumbnail a').map((i, elem) => elem.attribs.href).get();
                if (links.length==0) {
                    links = $('.article-list-title').map((i, elem) => $(elem).parent().attr('href')).get();
                }
                all_links = all_links.concat(links.slice(0, MAX_LINKS));
        }))).then(() => all_links.unique());
    }

    get_all_links().then(links => {
        console.log(links);
        // return Promise.map(links, (uri) => ingest_article(hatch, uri))
        //     .then(() => hatch.finish());
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
