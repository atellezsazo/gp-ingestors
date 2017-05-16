'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require('bluebird');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = "http://all-that-is-interesting.com/";
const rss_uri = "http://all-that-is-interesting.com/feed/";

//Remove elements (body)
const remove_elements = [
    'br + br',
    'hr + p',
    'iframe',
    'noscript',
    'script',
    '.gallery-descriptions-wrap',
    '.gallery-preview',
    '.hidden-md-up',
    '.related-posts',
    '.social-callout',
    '.social-list',
    '.sm-page-count',
    '.youtube_com',
];

//clean attr (tag)
const remove_attr = [
    'class',
    'height',
    'id',
    'sizes',
    'src',
    'srcset',
    'style',
    'width',
];

function ingest_post(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        //Set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        asset.set_canonical_uri(uri);

        // Pull out the updated date
        const modified_date = $profile('meta[property="article:modified_time"]').attr('content');
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        const section = $profile('meta[property="article:tag"]').map(function() {
            return $profile(this).attr('content');
        }).get();
        asset.set_section(section.join(", "));

        const by_line = $profile('.post-heading .container .row .byline').first();
        const author = by_line.find('.author').first().text();
        const published = by_line.find('.date').first().text();

        //main-image
        const main_image = $profile('meta[property="og:image"]').attr('content');
        const main_img = libingester.util.download_image(main_image, base_uri);
        main_img.set_title(title);
        hatch.save_asset(main_img);
        asset.set_thumbnail(main_img);

        //Synopsis
        const description = $profile('meta[property="og:description"]').attr('content');
        asset.set_synopsis(description);

        let body = [];

        const ingest_body = ($profile, finish_process) => {
            const post_body = $profile('article.post-content');

            const info_img = $profile('.gallery-descriptions-wrap');
            const img_promise = post_body.find("img").map(function() {
                const parent = $profile(this);
                if (this.attribs.src) {
                    const description = this.parent.attribs['aria-describedby'];
                    const image = libingester.util.download_img(this, base_uri);
                    if (description) { //save image info
                        const info_image = info_img.find('#' + description).first();
                        parent.before($profile(info_image));
                    }
                    this.attribs["data-libingester-asset-id"] = image.asset_id;
                    for (const attr of remove_attr) {
                        delete this.attribs[attr];
                    }
                    image.set_title(this.attribs.title || title);
                    hatch.save_asset(image);
                }
            });

            //clean image wrap
            post_body.find(".wp-caption").map(function() {
                for (const attr of remove_attr) {
                    if (this.attribs[attr]) {
                        delete this.attribs[attr];
                    }
                }
                this.attribs.class = "image-wrap";
            });

            //remove elements (body)
            for (const remove_element of remove_elements) {
                post_body.find(remove_element).remove();
            }

            post_body.find(".end-slide").parent().remove();
            body.push(post_body.html());

            const next = $profile('nav.pagination a.next').attr('href');
            if (next) {
                libingester.util.fetch_html(next).then(($next_profile) => {
                    ingest_body($next_profile, finish_process);
                });
            } else {
                finish_process();
            }
        };

        const body_promise = new Promise((resolve, reject) => {
            ingest_body($profile, function() {
                const content = mustache.render(template.structure_template, {
                    title: title,
                    date_published: published,
                    author: author,
                    category: section.join(", "),
                    post_body: body.join(""),
                });

                // save document
                asset.set_document(content);
                hatch.save_asset(asset);
                resolve();
            });
        });

        return Promise.all([body_promise]);
    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_uri, function(err, rss) {
        let post_urls = rss.items.map((datum) => datum.url);
        Promise.map(post_urls, function(url) {
            return ingest_post(hatch, url);
        }, { concurrency: 1 }).then(() => {
            return hatch.finish();
        });
    });
}

main();