'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require('bluebird');
const rss2json = require('rss-to-json');
const url = require('url');

const template = require('./template');

const RSS_URI = "http://www.duetdiary.com/feed/";

// Remove elements (body)
const REMOVE_ELEMENTS = [
    '.adsbygoogle',
    '.essb_links',
    'a[href="#"]',
    'iframe',
    'ins',
    'script',
    'video',
];

// clean attr (tag)
const REMOVE_ATTR = [
    'border',
    'height',
    'lang',
    'rel',
    'src',
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
    'ul'
];

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
        if (!post_main_img) { //problem with incomplete $profile 
            throw { code: -1 };
        }
        const asset_main_image = libingester.util.download_image(url.resolve(base_uri, post_main_img), base_uri);
        asset_main_image.set_title(post_title);
        hatch.save_asset(asset_main_image);

        // Article Settings
        asset.set_canonical_uri(uri);
        asset.set_title(post_title);
        asset.set_synopsis(post_synopsis);
        asset.set_last_modified_date(new Date(Date.parse(post_publishdate)));
        asset.set_thumbnail(asset_main_image);
        asset.set_section(post_tags.join(', '));

        // remove elements and comments
        post_body.contents().filter((index, node) => node.type === 'comment').remove();
        post_body.find(REMOVE_ELEMENTS.join(',')).remove();

        post_body.find('img').map(function() {
            const image = libingester.util.download_img($profile(this), base_uri);
            image.set_title(post_title);
            hatch.save_asset(image);
            this.attribs['data-libingester-asset-id'] = image.asset_id;
        });

        //clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $profile(tag).removeAttr(attr));
        post_body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));

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
    }).catch((err) => {
        if (err.code == -1 || err.statusCode == 403) {
            return ingest_article(hatch, uri);
        }
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(RSS_URI, (err, rss) => {
        const batch_links = rss.items.map(data => data.url);
        return Promise.all(batch_links.map((uri) => ingest_article(hatch, uri))).then(() => {
            return hatch.finish();
        }).catch((err) => {
            console.log('ingestor error: ', err);
        });
    });
}

main();