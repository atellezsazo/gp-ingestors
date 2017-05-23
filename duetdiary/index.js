'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require('bluebird');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

// Url
const base_uri = "http://www.duetdiary.com/";
const rss_uri = "http://www.duetdiary.com/feed/";

// Remove elements (body)
const remove_elements = ['.adsbygoogle', '.essb_links', 'a[href="#"]', 'div',
    'iframe', 'ins', 'script', 'video'
];

// clean attr (tag)
const remove_attr = ['border', 'height', 'lang', 'rel', 'src',
    'style', 'width'
];

// clean attr (tag)
const clear_tags = ['a', 'b', 'br', 'div', 'em', 'i', 'img', 'span', 'ul'];

/**
 * ingest_article function
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The URI of the post to ingest
 * @returns {Promise} Returns a promise with the content of the post requested
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();
        const post_title = $profile('meta[property="og:title"]').attr('content');
        const post_synopsis = $profile('meta[property="og:description"]').attr('content');
        const post_publishdate = $profile('.page-item-title-single .post-date').text();
        const post_author = $profile('.post-author').text();
        const post_main_img = $profile('meta[property="og:image"]').attr('content');
        const post_body = $profile('.entry-content').first();
        const post_category = $profile('.page-item-title-single .post-categories').text();
        const post_tags = $profile('.tags a').map((i, tag) => {
            return $profile(tag).text();
        }).get();

        // Pull out the main image
        const asset_main_image = libingester.util.download_image(post_main_img, base_uri);
        asset_main_image.set_title(post_title);
        hatch.save_asset(asset_main_image);

        // Article Settings
        asset.set_canonical_uri(uri);
        asset.set_title(post_title);
        asset.set_synopsis(post_synopsis);
        asset.set_last_modified_date(new Date(Date.parse(post_publishdate)));
        asset.set_thumbnail(asset_main_image);
        asset.set_section(post_tags.join(', '));

        // remove elements (body)
        remove_elements.map(detach_element => {
            post_body.find(detach_element).remove();
        });

        // remove comments (body)
        post_body.contents().filter(function() {
            return this.nodeType == 8;
        }).remove();

        post_body.find('img').map(function() {
            if (this.attribs.src != undefined) {
                const image = libingester.util.download_img($profile(this), base_uri);
                image.set_title(post_title);
                hatch.save_asset(image);
                this.attribs['data-libingester-asset-id'] = image.asset_id;
            }
        });

        // clear tags (body)
        for (const tag of clear_tags) {
            post_body.find(tag).map(function() {
                for (const attr of remove_attr) {
                    delete this.attribs[attr];
                }
            });
        }

        // render content
        const content = mustache.render(template.structure_template, {
            title: post_title,
            category: post_category,
            author: post_author,
            date_published: post_publishdate,
            main_image: asset_main_image,
            body: post_body.html(),
            post_tags: post_tags.join(', '),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
        return uri;
    }).catch((err) => {
        console.error("Error ingesting webpage!");
        console.error(err.stack);
        throw err;
    });
}

/**
 * main function
 *
 * @returns {Promise}
 */
function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_uri, (err, rss) => {
        const batch_links = rss.items.map(data => data.url);
        rss2json.load(rss_uri, (err, rss) => {
            const batch_links = rss.items.map(data => data.url);
            return Promise.all(batch_links.map((uri) => ingest_article(hatch, uri))).then(() => {
                return hatch.finish();
            }).catch((err) => {
                console.log('ingestor error: ', err);
            });
        });
    });
}

main();

/* End of file index.js */
/* Location: ./duetdiary/index.js */