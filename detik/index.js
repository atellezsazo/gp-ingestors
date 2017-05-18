'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rss2json = require('rss-to-json');
const template = require('./article_template');
const url = require('url');
const URLParse = require('url-parse');

const base_uri = "https://news.detik.com/";
const rss_uri = "http://rss.detik.com/index.php/detikcom";

// Remove elements (body)
const remove_elements = ['#bx_polong', '#thepolong', '.detikads', '.news_tag',
    '.newstag', '.thepolong', '[id^="beacon"]', 'a[href="#"]', 'iframe',
    'script', 'video'
];

// clean attr (tag)
const remove_attr = ['border', 'class', 'height', 'id', 'lang', 'rel', 'style',
    'width'
];

// clean attr (tag)
const clear_tags = ['a', 'b', 'br', 'div', 'em', 'i', 'img', 'span', 'ul'];

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
        const main_img_description = $profile('.pic_artikel-wrapper span').text();
        const art_body = $profile('.detail_text');
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

        // remove elements (body)
        remove_elements.map(detach_element => {
            art_body.find(detach_element).remove();
        });

        // remove comments (body)
        art_body.contents().filter(function() {
            return this.nodeType == 8;
        }).remove();

        // download images
        art_body.find('img').map(function() {
            if (this.attribs.src != undefined) {
                const image = libingester.util.download_img(this, base_uri);
                image.set_title(art_title);
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
            }
        });

        // clear tags (body)
        for (const tag of clear_tags) {
            art_body.find(tag).map(function() {
                for (const attr of remove_attr) {
                    delete this.attribs[attr];
                }
            });
        }

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
    rss2json.load(rss_uri, (err, rss) => {
        const batch_links = rss.items.map(data => data.url);
        Promise.all(batch_links.map(uri => ingest_article(hatch, uri)))
            .then(() => {
                return hatch.finish();
            });
    });
}

main();

/* End of file index.js */
/* Location: ./detik/index.js */