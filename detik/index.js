'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const URLParse = require('url-parse');

const template = require('./article_template');

const RSS_URI = "http://rss.detik.com/index.php/detikcom";

// Remove elements (body)
const REMOVE_ELEMENTS = [
    '#bx_polong',
    '#thepolong',
    '#thumbs',
    '.detikads',
    '.news_tag',
    '.newstag',
    '.thepolong',
    '[id^="beacon"]',
    'a[href="#"]',
    'iframe',
    'script',
    'video',
];

// clean attr (tag)
const REMOVE_ATTR = [
    'border',
    'data-page',
    'height',
    'lang',
    'rel',
    'style',
    'width',
];

// clean attr (tag)
const CLEAN_TAGS = [
    'a',
    'b',
    'br',
    'div',
    'em',
    'i',
    'img',
    'span',
    'ul',
];

/**
 * ingest_article
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The URI of the post to ingest
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();
        const art_title = $profile('meta[property="og:title"]').attr('content');
        const art_synopsis = $profile('meta[property="og:description"]').attr('content');
        const art_publishdate = $profile('meta[name="publishdate"]').attr('content');
        const art_author = $profile('meta[name="author"]').attr('content');
        const art_main_img = $profile('meta[property="og:image"]').attr('content');
        const main_img_description = $profile('.pic_artikel-wrapper span, .pic_artikel span').text();
        let art_body = $profile('.detail_text');
        const art_uri = new URLParse(base_uri);
        const art_category = art_uri.host.split('.')[0];

        // Pull out the main image
        const main_image = libingester.util.download_image(art_main_img, uri);
        main_image.set_title(art_title);
        hatch.save_asset(main_image);

        // Article Settings
        asset.set_canonical_uri(uri);
        asset.set_title(art_title);
        asset.set_synopsis(art_synopsis);
        asset.set_last_modified_date(new Date(Date.parse(art_publishdate)));
        asset.set_thumbnail(main_image);
        asset.set_section(art_category);

        // remove elements and comments
        art_body.contents().filter((index, node) => node.type === 'comment').remove();
        art_body.find(REMOVE_ELEMENTS.join(',')).remove();

        // download images
        art_body.find('img').map(function() {
            if (this.attribs['data-original']) {
                $profile(this).attr('src', this.attribs['data-original']);
            }
            if (this.attribs.src != undefined) {
                const image = libingester.util.download_img(this, base_uri);
                image.set_title(art_title);
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
            }
        });

        //clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $profile(tag).removeAttr(attr));
        art_body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));

        // render content
        const content = mustache.render(template.structure_template, {
            title: art_title,
            category: art_category,
            author: art_author,
            date_published: art_publishdate,
            main_image: main_image,
            image_credit: main_img_description,
            body: art_body.html(),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(RSS_URI, (err, rss) => {
        const batch_links = rss.items.map(data => data.url);
        Promise.all(batch_links.map(uri => ingest_article(hatch, uri)))
            .then(() => {
                return hatch.finish();
            });
    });
}

main();