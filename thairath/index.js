'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const template = require('./template');
const url = require('url');
const rss2json = require('rss-to-json');

const base_uri = "http://www.thairath.co.th";
const rss_uri = "http://www.thairath.co.th/rss/news.xml";

// Remove elements (body)
const remove_elements = ['iframe', 'script', 'video'];

// clean attr (tag)
const remove_attr = ['border', 'class', 'height', 'id', 'lang', 'rel', 'style',
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
        const synopsis = $profile('meta[property="og:description"]').attr('content');
        const publishdate = $profile('meta[property="og:article:published_time"]').attr('content');
        const modifieddate = $profile('meta[http-equiv="last-modified"]').attr('content');
        const author = $profile('.datetime a').text();
        const main_img = $profile('meta[property="og:image"]').attr('content');
        const body = $profile('#mainContent article');
        const post_tags = $profile('.tag.button_tag a');

        let section = [];
        post_tags.map(function() {
            section.push($profile(this).text());
        });

        // Pull out the main image
        const main_image = libingester.util.download_image(main_img, uri);
        main_image.set_title(title);
        hatch.save_asset(main_image);

        // Article Settings
        asset.set_canonical_uri(uri);
        asset.set_title(title);
        asset.set_synopsis(synopsis);
        asset.set_last_modified_date(new Date(Date.parse(modifieddate)));
        asset.set_thumbnail(main_image);
        asset.set_section(section.join(','));

        // Get img from figure
        body.find('figure').map(function() {
            let img = $profile(this).find('img').first();

            // Insert img after figure
            $profile(this).replaceWith($profile(img));
        });

        // remove elements (body)
        remove_elements.map(detach_element => {
            body.find(detach_element).remove();
        });

        // download images
        body.find('img').map(function() {
            if (this.attribs.src != undefined) {
                const image = libingester.util.download_img(this, base_uri);
                image.set_title(title);
                hatch.save_asset(image);
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
            main_image: main_image,
            body: body.html(),
            post_tags: post_tags
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_uri, (err, rss) => {
        const batch_links = rss.items.map(data => data.link);
        Promise.all(batch_links.map(uri => ingest_article(hatch, uri))).then(() => {
            return hatch.finish();
        });
    });
}

main();

/* End of file index.js */
/* Location: ./thairath/index.js */