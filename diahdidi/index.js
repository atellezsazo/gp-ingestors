'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const template = require('./template');
const url = require('url');

const base_uri = "http://www.diahdidi.com";

// Remove elements (body)
const remove_elements = ['iframe', 'script', 'video'];

// clean attr (tag)
const remove_attr = ['border', 'class', 'data-srcset', 'height', 'id', 'lang', 'rel', 'style',
    'width', 'figure'
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
        remove_elements.map(detach_element => {
            body.find(detach_element).remove();
        });

        // download images
        body.find('img').map(function() {
            if (this.attribs.src != undefined) {
                const image = libingester.util.download_img($profile(this), base_uri);
                image.set_title(title);
                hatch.save_asset(image);
                for (const attr of remove_attr) {
                    delete this.attribs[attr];
                }
                this.attribs["data-libingester-asset-id"] = image.asset_id;
            }
        });

        // clear tags
        for (const tag of clear_tags) {
            $profile(tag).map(function() {
                for (const attr of remove_attr) {
                    delete this.attribs[attr];
                }
            });
        }

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
    const posts = new Promise((resolve, reject) => {
        libingester.util.fetch_html(base_uri).then(($posts) => {
            const posts_links = $posts('.date-outer .post-title a').map(function() {
                const uri = $posts(this).attr('href');
                return url.resolve(base_uri, uri);
            }).get();
            Promise.all(posts_links.map((uri) => ingest_article(hatch, uri))).then(() => {
                return hatch.finish();
            }).catch((err) => reject(err));
        });
    });
}

main();

/* End of file index.js */
/* Location: ./thairath/index.js */