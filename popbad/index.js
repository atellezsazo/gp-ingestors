'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://www.pobpad.com/';

const CATEGORY_LINKS = [
    'http://www.pobpad.com/การมีสุขภาพดี', //Healthy Living
    'http://www.pobpad.com/ครอบครัว', //Family
    'http://www.pobpad.com/สุขภาพ' //Health
];

/** delete duplicated elements in array **/
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

// max number of links per category
const MAX_LINKS = 10;

const CUSTOM_CSS = `
$primary-light-color: #FF4C00;
$primary-medium-color: #36332F;
$primary-dark-color: #5F5F5F;
$accent-light-color: #1D70D9;
$accent-dark-color: #1161C7;
$background-light-color: #F6F4F1;
$background-dark-color: #C9C3BD;

$title-font: ‘Noto Sans’;
$body-font: 'Noto Sans';
$display-font: 'Noto Sans';
$context-font: 'Noto Sans';
$support-font: 'Noto Sans';

@import "_default";
`;

const CLEAN_TAGS = [
    'p',
    'span',
    'div',
    'li',
    'ul'
];

// clean images
const REMOVE_ATTR = [
    'class',
    'data-src',
    'data-te-category',
    'data-te-label',
    'data-te-tracked',
    'style',
];

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'div',
    'link',
    'noscript',
    'script',
    'style',
    '.share-button',
];


function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {

        const asset = new libingester.NewsArticle();
        const author = 'Pobpad';
        const title = $('meta[property="og:title"]').attr('content');
        const section = $('meta[property="article:section"]').attr('content');
        let body = $('.entry-content');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const info_date = $('meta[property="og:updated_time"]').attr('content');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const page = 'Pobpad';
        const read_more = `บทความต้นฉบับที่ <a href="${canonical_uri}">${page}</a>`;
        const synopsis = $('meta[name="description"]').attr('content');
        let thumbnail;

        // remove elements
        body.contents().filter((index, node) => node.type === 'comment').remove();
        const clean_attr = (elem) => REMOVE_ATTR.forEach(attr => $(elem).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // download images
        body.find('img').map(function() {
            let img = $('<figure></figure>').append($(this).clone());
            let figcaption = $(this).attr('alt') || {};
            img.append($(`<figcaption><p>${figcaption}</p></figcaption>`));
            $(figcaption).remove();
            const image = libingester.util.download_img($(img.children()[0]));
            if (!thumbnail) {
                asset.set_thumbnail(thumbnail=image);
            }
            $(this).replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);
       });

        // set first paragraph
        const first_p = body.find('p').first();
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);
        body.find(first_p).remove();

        // Get out 'ul' from 'p'
        body.find('p>ul').map((i,elem) => {
            const parent = $(elem).parent();
            parent.contents().map((i, content) => {
                $(content).insertBefore(parent);
            });
        });

        //Convert span to p
        body.contents().filter((i,elem) => elem.name=='span').map((i,elem) => elem.name='p');

        // convert 'p strong' and b to 'h2'
        body.contents().filter((i,elem) => elem.name=='b').map((i,elem) => elem.name='h2');
        body.find('p>b').map((i,elem) => {
            const text = $(elem).text().trim();
            let parent = $(elem).parent()[0];
            while (parent) {
                if (parent.name == 'p') {
                    const p_text = $(parent).text().trim();
                    if (text == p_text) {
                        $(parent).replaceWith($(`<h2>${text}</h2>`));
                    }
                    break;
                } else {
                    parent = $(parent).parent()[0];
                }
            }
        });


        body.find(CLEAN_TAGS.join(',')).map((i,elem) => clean_attr(elem));
        body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

        // Article Settings
        console.log('processing: ', title);
        asset.set_authors([author]);
        asset.set_canonical_uri(canonical_uri);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_link(read_more);
        asset.set_section(section);
        asset.set_source(page);
        asset.set_synopsis(synopsis);
        asset.set_title(title);
        asset.set_body(body);

        asset.render();
        hatch.save_asset(asset);

   }).catch((err) => {
       console.log('Ingest article error: ', err);
       if (err.code==-1) { return ingest_article(hatch, uri); }
   });
}

function _fetch_all_links(links, max) {
    let all_links = []; // all links retrieved from all categories
    return Promise.all(links.map(link => libingester.util.fetch_html(link).then($ => {
        const links = $('ul .recent-link').map((i,a) => url.resolve(BASE_URI, a.attribs.href)).get().slice(0, max);
        all_links = all_links.concat(links);
    }))).then(() => all_links.unique()); // before sending, repeated links are removed
}

function main() {
    const hatch = new libingester.Hatch('pobpad', 'th');

    _fetch_all_links(CATEGORY_LINKS, MAX_LINKS).then(all_links => {
        return Promise.all(all_links.map(link => ingest_article(hatch, link)));
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    })
}

main();
