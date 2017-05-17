'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require("bluebird");
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');
const xml2js = require('xml2js');

const base_uri = "https://www.kapanlagi.com/";
const rss_uri = "https://www.kapanlagi.com/feed/";
const concurrency = 1;

// Remove elements (body)
const remove_elements = [
    'iframe',
    'noscript',
    'script',
    'style',
    '.box-share-img-detail',
    '.lifestyle-in-content',
    '.link-pagging-warper',
    '.paging-related',
    '.video-wrapper',
    '.lifestyle-in-content'
];

// clean attr (tag)
const remove_attr = [
    'class',
    'height',
    'id',
    'sizes',
    'src',
    'srcset',
    'style',
    'width'
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const asset = new libingester.NewsArticle();
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        asset.set_canonical_uri(uri);

        //Set title section
        const title = $profile("#newsdetail-right-new h1").first().text();
        const category = $profile(".newsdetail-categorylink").first().text();
        const subtitle = $profile("h2.entertainment-newsdetail-title-new").first().text();
        asset.set_title(title);

        const reporter = $profile('.vcard .newsdetail-schedule-new a').text();
        const date = $profile('.vcard .newsdetail-schedule-new.updated').text();

        // Pull out the main image
        const main_img = $profile('meta[property="og:image"]').attr('content');
        const main_image = libingester.util.download_image(main_img, uri);
        main_image.set_title(title);
        const image_credit = $profile('.entertainment-newsdetail-headlineimg .copyright, .pg-img-warper span').text();
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);

        const synopsis = $profile('meta[name="description"]').attr('content');
        asset.set_synopsis(synopsis);
        const post_tags = $profile('.box-content a');

        // Pull out the updated date
        const info_date = $profile('.newsdetail-schedule-new .value-title').attr('title');
        let modified_date = new Date(Date.parse(info_date));
        if (!info_date) {
            modified_date = new Date();
        }

        asset.set_last_modified_date(modified_date);
        asset.set_section(category);

        let pages = [];
        const ingest_body = ($profile, finish_process) => {
            let post_body = $profile('.entertainment-detail-news');
            // Download images
            post_body.find("img").map(function() {
                if (this.attribs.src) {
                    const image = libingester.util.download_img(this, base_uri);
                    image.set_title(title);
                    hatch.save_asset(image);
                    this.attribs["data-libingester-asset-id"] = image.asset_id;
                    for (const attr of remove_attr) {
                        delete this.attribs[attr];
                    }
                }
            });

            post_body.find("a, div, h1, h2, h3, h4, h5, h6, span").map(function() {
                if (this.attribs.style) {
                    delete this.attribs.style;
                }
            });

            // resolve links
            post_body.find("a").map(function() {
                this.attribs.href = url.resolve(base_uri, this.attribs.href);
            });

            const next = $profile('.link-pagging-warper a').attr('href');
            const last_pagination = $profile('ul.pg-pagging li:last-child a').first();

            // remove elements (body)
            for (const remove_element of remove_elements) {
                post_body.find(remove_element).remove();
            }

            pages.push(post_body.html());

            if (next && last_pagination.length != 0) {
                libingester.util.fetch_html(url.resolve(base_uri, next)).then(($next_profile) => {
                    ingest_body($next_profile, finish_process);
                });
            } else {
                finish_process();
            }
        };

        const promise = new Promise((resolve, reject) => {
            ingest_body($profile, function() {
                const content = mustache.render(template.structure_template, {
                    title: title,
                    subtitle: subtitle,
                    author: reporter,
                    category: category,
                    date_published: date,
                    main_image: main_image,
                    image_credit: image_credit,
                    body: pages.join(''),
                    post_tags: post_tags,
                });

                // save document
                asset.set_document(content);
                hatch.save_asset(asset);
                resolve();
            });
        })
        return Promise.all([promise]);
    }).catch((error) => {
        console.log("Ingest error: ", error);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    rp({ uri: rss_uri, gzip: true }).then((res) => {
        var parser = new xml2js.Parser({ trim: false, normalize: true, mergeAttrs: true });
        parser.parseString(res, function(err, result) {
            const rss = rss2json.parser(result);
            let links = [];
            rss.items.map((datum) => {
                if (!datum.link.includes("musik.kapanlagi.com")) { //drop musik subdomain
                    links.push(datum.link);
                }
            });

            Promise.map(links, function(link) {
                return ingest_article(hatch, link);
            }, { concurrency: concurrency }).then(function() {
                return hatch.finish();
            })
        });
    });
}

main();