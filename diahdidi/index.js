'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const url = require('url');
const template = require('./template');

const BASE_URI = "http://www.diahdidi.com";

// Remove elements (body)
const remove_elements = [
    'iframe',
    'script',
    'video',
];

// clean attr (tag)
const remove_attr = [
    'border',
    'data-original-height',
    'data-original-width',
    'data-srcset',
    'figure',
    'height',
    'lang',
    'rel',
    'style',
    'width',
];

// clean attr (tag)
const clean_elements = [
    'a',
    'b',
    'br',
    'div',
    'em',
    'h1',
    'h2',
    'h3',
    'i',
    'img',
    'span',
    'ul'
];

/**
 * ingest_article
 *
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The URI of the post to ingest
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const doc_base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();
        const title = $profile('meta[property="og:title"]').attr('content');
        const publishdate = $profile('abbr.published').attr('title');
        const author = $profile('.post-author a');
        const main_img = $profile('meta[property="og:image"]').attr('content');
        const body = $profile('.post-body');
        const post_tags = $profile('.post-labels').text().replace('Label:', '');

        // Pull out the main image
        const main_image = libingester.util.download_image(main_img, uri);
        main_image.set_title(title);
        hatch.save_asset(main_image);

        // Article Settings
        asset.set_canonical_uri(uri);
        asset.set_title(title);
        asset.set_synopsis(body.text().substring(0, 140));
        asset.set_last_modified_date(new Date(Date.parse(publishdate)));
        asset.set_thumbnail(main_image);
        asset.set_section(post_tags);

        // Get img from figure
        body.find('a').map(function() {
            let img = $profile(this).find('img').first();
            // Insert img after figure
            if (img) {
                $profile(this).replaceWith($profile(img));
            }
        });

        // remove elements (body)
        body.find(remove_elements.join(',')).remove();

        // download images
        body.find('img').map(function() {
            const image = libingester.util.download_img($profile(this), doc_base_uri);
            image.set_title(title);
            hatch.save_asset(image);
            this.attribs["data-libingester-asset-id"] = image.asset_id;
        });

        const clean_attr = (tag, a = remove_attr) => a.forEach((attr) => $profile(tag).removeAttr(attr));
        const clean_tags = (tags) => tags.get().map((t) => clean_attr(t));
        clean_tags(body.find(clean_elements.join(',')));

        // render content
        const content = mustache.render(template.structure_template, {
            title: title,
            author: author,
            date_published: publishdate,
            body: body.html().replace(/<!--[\s\S]*?-->/g, ""),
            post_tags: post_tags
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    libingester.util.fetch_html(BASE_URI).then(($posts) => {
        const posts_links = $posts('.date-outer .post-title a').map(function() {
            const uri = $posts(this).attr('href');
            return url.resolve(BASE_URI, uri);
        }).get();
        Promise.all(posts_links.map((uri) => ingest_article(hatch, uri))).then(() => {
            return hatch.finish();
        }).catch((err) => console.log(err));
    });
}

main();