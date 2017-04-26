'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = 'https://www.pergidulu.com/';
const rss_feed = 'https://www.pergidulu.com/feed/'; //Artists

//Remove attributes (images)
const attr_image = [
    'class',
    'data-lazy-sizes',
    'data-lazy-src',
    'data-lazy-srcset',
    'height',
    'sizes',
    'src',
    'srcset',
    'width',
];

//Remove elements (body)
const remove_elements = [
    'div',
    'noscript',
    'script',
];

function ingest_article(hatch, uri) {
    return new Promise(function(resolve, reject) {
        libingester.util.fetch_html(uri).then(($) => {
            const base_uri = libingester.util.get_doc_base_uri($, uri);
            const asset = new libingester.NewsArticle();
            console.log(uri);

            //Set title section
            const title = $('meta[property="og:title"]').attr('content');
            asset.set_title(title);
            asset.set_canonical_uri(uri);

            // Pull out the updated date and section
            const modified_date = $('meta[property="article:published_time"]').attr('content');
            asset.set_last_modified_date(new Date(Date.parse(modified_date)));
            const section = $('meta[property="article:section"]').attr('content');
            asset.set_section(section);

            // Pull out the main image
            const main_img_url = $('meta[property="og:image"]').attr('content');
            const main_image = libingester.util.download_image(main_img_url);
            hatch.save_asset(main_image);

            const info_article = $('div#single-below-header').first();
            const body = $('div.post-content div.content-inner').first();

            //remove elements (body)
            for (const remove_element of remove_elements) {
                body.find(remove_element).remove();
            }

            // download images
            let time = 0;
            const img_promises = body.find("img").map(function() {
                const that = this;
                return new Promise(function(resolve, reject){
                    setTimeout(function(){
                        const src = that.attribs['data-lazy-src'];
                        if ( src ) {
                            const image = libingester.util.download_image( src );
                            that.attribs["data-libingester-asset-id"] = image.asset_id;
                            for(const attr of attr_image){
                                delete that.attribs[attr];
                            }
                            hatch.save_asset(image);
                            resolve(true);
                        }
                    },time++*500);
                });
            }).get();

            Promise.all( img_promises ).then(() => {
                const content = mustache.render(template.structure_template, {
                    title: title,
                    info_article: info_article.html(),
                    body: body.children(),
                });

                asset.set_document(content);
                hatch.save_asset(asset);
                resolve(true);
            });
        }).catch((err) => {
            resolve(false);
        });
    });
}

function main() {
    const hatch = new libingester.Hatch();

    rss2json.load(rss_feed, function(err, rss){
        const news_uris =  rss.items.map((datum) => datum.url);

        Promise.all(news_uris.map((uri) => ingest_article(hatch, uri))).then(() => {
            return hatch.finish();
        });
    });
}

main();
