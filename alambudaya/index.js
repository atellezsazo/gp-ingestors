'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require('bluebird');
const rp = require('request-promise');
const template = require('./template');
const url = require('url');
const rss2json = require('rss-to-json');

const base_uri = 'http://www.alambudaya.com/';
const rss_uri = 'http://www.alambudaya.com/feeds/posts/default';

const clean_tag = [
    'a',
    'b',
    'br',
    'div',
    'em',
    'span',
];

//Remove metadata
const img_metadata = [
    'border',
    'class',
    'height',
    'imageanchor',
    'sizes',
    'src',
    'rscset',
    'style',
    'width',
];

//Remove elements
const remove_elements = [
    'style',
];

//embed content
const video_iframes = [
    'youtube', //YouTube
];

function ingest_article(hatch, obj) {
    return libingester.util.fetch_html(obj.uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($, obj.uri);
        const modified_date = new Date(Date.parse(obj.updated));
        const synopsis = $('meta[property="og:description"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');

        asset.set_title(title);
        asset.set_section('Article');
        asset.set_canonical_uri(obj.uri);
        asset.set_last_modified_date(modified_date); // no date
        asset.set_title(title);
        asset.set_synopsis(synopsis);

        const body = $('#Blog1 .post-body').first();

        //Download images
        let firstImage = true;
        body.find("img").map(function() {
            if (this.attribs.src) {
                const image = libingester.util.download_img(this, base_uri);
                image.set_title(title);
                hatch.save_asset(image);
                if (firstImage) {
                    asset.set_thumbnail(image);
                    firstImage = false;
                }
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for (const img_meta of img_metadata) {
                    delete this.attribs[img_meta];
                }
            }
        });

        //remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }
        body.find('iframe').parent().remove();

        //clean attributes
        for (const tag of clean_tag) {
            body.find(tag).map(function() {
                for (const attr of img_metadata) {
                    $(this).removeAttr(attr);
                }
            });
        }

        const content = mustache.render(template.structure_template, {
            author: obj.author,
            date_published: obj.updated.substring(0, 10), // only date (yyyy-mm-dd)
            title: title,
            body: body.html(),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const concurrency = 2;
    const hatch = new libingester.Hatch();

    libingester.util.fetch_html(rss_uri).then(($) => {
        const objects = $('entry').map(function() {
            return {
                author: $(this).find('author name').text(),
                updated: $(this).find('updated').text(),
                uri: $(this).find('link[rel="alternate"]').attr('href'),
            }
        }).get();
        Promise.map(objects, (obj) => ingest_article(hatch, obj), { concurrency: concurrency }).then(() => {
            return hatch.finish();
        }).catch((err) => {
            console.log('Error ingestor:', err);
        });
    });
}

main();