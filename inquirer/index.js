'use strict';

const libingester = require('libingester');
const rss2json = require('rss-to-json');
const url = require('url');

const RSS_FEED = 'http://www.inquirer.net/fullfeed';

const CUSTOM_SCSS = `
$primary-light-color: #004C8C;
$primary-medium-color: #000000;
$primary-dark-color: #0C7BC1;
$accent-light-color: #0069AA;
$accent-dark-color: #00629F;
$background-light-color: #F7F7F7;
$background-dark-color: #F0F0F0;

$title-font: 'Work Sans';
$body-font: 'Merriweather';
$display-font: 'Josefin Sans';
$context-font: 'Josefin Sans';
$support-font: 'Work Sans';

@import "_default";
`;

/** cleaning elements **/
const CLEAN_ELEMENTS = [
    'a',
    'figure',
    'h2',
    'i',
    'p',
    'span',
    'ul',
];

/** delete attr (tag) **/
const REMOVE_ATTR = [
    'align',
    'border',
    'class',
    'dir',
    'onclick',
    'onmouseover',
    'style',
    'title',
];

/** remove elements (body) **/
const REMOVE_ELEMENTS = [
    'blockquote',
    'noscript',
    'script',
    'style',
];

/** get articles metadata **/
function _get_ingest_settings($) {
    const canonical_uri = $('link[rel="canonical"]').attr('href');
    const modDate = $('meta[property="DC.date.issued"]').attr('content');
    const date = new Date(Date.parse(modDate));
    return {
        author: $('meta[name="author"]').attr('content'),
        body: $('#outbrain_readmore').first().attr('id','mybody'),
        canonical_uri: canonical_uri,
        date_published: date,
        modified_date: date,
        custom_scss: CUSTOM_SCSS,
        read_more: `Original Article at <a href="${canonical_uri}">www.inquirer.net</a>`,
        section: $('#art_bc').first().text().trim(),
        synopsis: $('meta[property="og:description"], meta[name="description"]').attr('content'),
        source: 'inquirer',
        title: $('meta[property="og:title"]').attr('content'),
        uri_thumb: $('meta[property="og:image"]').attr('content'),
    }
}

/** set articles metadata **/
function _set_ingest_settings(asset, meta) {
    if (meta.author) asset.set_authors(meta.author);
    if (meta.body) asset.set_body(meta.body);
    if (meta.canonical_uri) asset.set_canonical_uri(meta.canonical_uri);
    if (meta.custom_scss) asset.set_custom_scss(meta.custom_scss);
    if (meta.date_published) asset.set_date_published(meta.date_published);
    if (meta.modified_date) asset.set_last_modified_date(meta.modified_date);
    if (meta.lede) asset.set_lede(meta.lede);
    if (meta.read_more) asset.set_read_more_link(meta.read_more);
    if (meta.section) asset.set_section(meta.section);
    if (meta.source) asset.set_source(meta.source);
    if (meta.synopsis) asset.set_synopsis(meta.synopsis);
    if (meta.title) asset.set_title(meta.title);
}

/** ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The post uri
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        let thumbnail;

        // function for download image
        const download_img = (elem) => {
            if (elem.attribs.src) {
                const image = libingester.util.download_img($(elem));
                image.set_title(meta.title);
                hatch.save_asset(image);
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            } else {
                $(elem).remove();
            }
        };

        // remove elements
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();

        // fix images, add figure, figcaption and download
        meta.body.find('img').map((i,elem) => {
            const alt = elem.attribs.alt;
            let src = elem.attribs.src;
            // Base64 images are incomplete, empty download
            if (src.includes('data:image')) src = elem.attribs['data-lazy-src'];

            let parent = $(elem).parent();
            while (parent[0]) {
                if (parent[0].name == 'div') {
                    // create element figure
                    let figure = $(`<figure><img src="${src}" alt="${alt}"/></figure>`);
                    let next = parent.find('.wp-caption-text').first()[0];
                    // finding caption
                    if (next) {
                        if ($(next).text().trim() !== '') {
                            figure.append($('<figcaption></figcaption>').append($(next).clone()));
                        }
                        $(next).remove();
                    }
                    // download image
                    download_img(figure.children()[0]);
                    $(parent).replaceWith(figure);
                    break;
                } else {
                    parent = parent.parent();
                }
            }
        });

        // download thumbnail
        if (!thumbnail && meta.uri_thumb) {
            const image = libingester.util.download_image(meta.uri_thumb);
            image.set_title(meta.title);
            asset.set_thumbnail(image);
            hatch.save_asset(image);
        }

        // clean tags
        meta.body.find('iframe, div').remove();
        meta.body.find('p, span').filter((i,elem) => $(elem).text().trim() === '').remove();
        clean_tags(meta.body.find(CLEAN_ELEMENTS.join(',')));

        // set lede
        for (const p of meta.body.find('p').get()) {
            if ($(p).parent()[0].attribs.id == 'mybody') {
                meta.lede = $(p).clone();
                $(p).remove();
                break;
            }
        }

        console.log('processing',meta.title);
        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET') return ingest_article(hatch, item);
    });
}

function main() {
    const hatch = new libingester.Hatch('inquirer', 'en');

    rss2json.load(RSS_FEED, (err, rss) => {
        Promise.all(rss.items.map(item => ingest_article(hatch, item.link)))
            .then(() => hatch.finish())
            .catch(err => {
                console.log(err);
                process.exitCode = 1;
            });
    });
}

main();
