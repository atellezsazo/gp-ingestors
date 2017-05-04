'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = "http://all-that-is-interesting.com/";
const rss_uri = "http://all-that-is-interesting.com/feed";

//Remove elements (body)
const remove_elements = [
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

//embed content
const video_iframes = [
    'interactive.tegna-media',
    'yahoo',
    'youtube',
];

function ingest_post(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);

        //Set title section
        const title = $profile('.post-title').first().text().replace(/[\n\t\r]/g, "");
        asset.set_title(title);
        asset.set_canonical_uri(uri);

        // Pull out the updated date
        const modified_date = $profile('meta[property="article:modified_time"]').attr('content');
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        const section = $profile('meta[property="article:tag"]').map(function() {
            return $profile(this).attr('content');
        }).get();
        asset.set_section(section.join(", "));

        const by_line = $profile('.post-heading .container .row .byline').children();

        let body = [];
        const ingest_body = ($profile, finish_process) => {
            const post_body = $profile('article.post-content');

            // download videos
            const videos = post_body.find("iframe").map(function() {
                const iframe_src = this.attribs.src;
                for (const video_iframe of video_iframes) {
                    if (iframe_src.includes(video_iframe)) {
                        const video_url = this.attribs.src;
                        const full_uri = url.format(video_url, { search: false })
                        const video_asset = new libingester.VideoAsset();
                        video_asset.set_canonical_uri(full_uri);
                        video_asset.set_last_modified_date(modified_date);
                        video_asset.set_title(title);
                        video_asset.set_download_uri(full_uri);
                        hatch.save_asset(video_asset);
                    }
                }
            });

            const info_img = $profile('.gallery-descriptions-wrap');
            const img_promises = post_body.find("img").map(function() {
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
                    image.set_title(this.attribs.title);
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

        const test = new Promise((resolve, reject) => {
            ingest_body($profile, function() {
                const content = mustache.render(template.structure_template, {
                    title: title,
                    by_line: by_line,
                    post_body: body.join(""),
                });

                // save document
                asset.set_document(content);
                hatch.save_asset(asset);
                resolve();
            });
        });

        return Promise.all([test]);

    });
}

function main() {
    const hatch = new libingester.Hatch();
    rss2json.load(rss_uri, function(err, rss) {
        const post_urls = rss.items.map((datum) => datum.url);
        Promise.all(post_urls.map((url) => ingest_post(hatch, url))).then(() => {
            return hatch.finish();
        });
    });
}

main();