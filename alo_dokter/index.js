'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://www.alodokter.com';

const CATEGORY_LINKS = [
    'http://www.alodokter.com/hidup-sehat', //Healthy Living
    'http://www.alodokter.com/keluarga', //Family
    'http://www.alodokter.com/kesehatan' //Health
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

$title-font: 'Raleway';
$body-font: 'Roboto';
$display-font: 'Raleway';
$context-font: 'Raleway';
$support-font: 'Raleway';

@import "_default";
`;

const CLEAN_TAGS = [
    'p',
    'span',
    'div'
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
        const author = $('meta[name="bt:author"]').attr('content') || 'Alodokter';
        const section = $('meta[property="article:section"]').attr('content');
        let body = $('.entry-content body');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const info_date = $('meta[property="og:updated_time"]').attr('content');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const page = 'Alodokter';
        const read_more = `Baca lebih lanjut di <a href="${canonical_uri}">${page}</a>`;
        const synopsis = $('meta[name="description"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        let thumbnail;

        // remove elements
        body.contents().filter((index, node) => node.type === 'comment').remove();
        const clean_attr = (elem) => REMOVE_ATTR.forEach(attr => $(elem).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // set first paragraph
        const first_p = body.find('p').first();
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);
        body.find(first_p).remove();

        // download images
        body.find('img').map((i,elem) => {
            let img = $('<figure></figure>').append($(elem).clone());
            const image = libingester.util.download_img($(img.children()[0]));
            if (!thumbnail) {
                asset.set_thumbnail(thumbnail=image);
            }
            $(elem).replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);
       });

        // clean tags
        body.find(CLEAN_TAGS.join(',')).map((i,elem) => clean_attr(elem));

        const end_tag = ['p', 'h3', 'ul', 'h2'];
        const is_end_tag = (tag) => {
            for (const tag_name of end_tag) {
                if (tag_name == tag.name) return true;
            }
            return false;
        }

        //We introduce in labels p the text that is directly in the body
        let new_p = $('<p></p>');
        body.contents().map((i,elem) => {
            if (is_end_tag(elem) && new_p.text().trim() != '') {
                new_p.clone().insertBefore(elem);
                new_p = $('<p></p>');
            } else if (!is_end_tag(elem)) {
                new_p.append($(elem).clone());
                $(elem).remove();
            }
        });

        body.find('p>em').map((i,elem) => {
            if ($(elem).text().includes('sponsored by:')) {
                $(elem).parent().remove()
            }
        });

        // Article Settings
        console.log('processing: ', uri);
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
        const links = $('.alodokter-thumbnails a').map((i,a) => url.resolve(BASE_URI, a.attribs.href)).get().slice(0, max);
        all_links = all_links.concat(links);
    }))).then(() => all_links.unique()); // before sending, repeated links are removed
}

function main() {
    const hatch = new libingester.Hatch('alo_dokter', 'id');

    _fetch_all_links(CATEGORY_LINKS, MAX_LINKS).then(links => {
        return Promise.all(links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
