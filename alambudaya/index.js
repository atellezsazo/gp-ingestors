'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const template = require('./template');
const url = require('url');
const rss2json = require('rss-to-json');

const base_uri = 'http://www.alambudaya.com/';
const rss_uri = 'http://www.alambudaya.com/feeds/posts/default';

//Remove metadata
const img_metadata = [
    'class',
    'data-jpibfi-indexer',
    'data-jpibfi-post-excerpt',
    'data-jpibfi-post-url',
    'data-jpibfi-post-title',
    'height',
    'id',
    'rscset',
    'sizes',
    'src',
    'width',
];

//Remove elements
const remove_elements = [
    // 'iframe',
    // 'input',
    // 'noscript', //any script injection
    // 'script', //any script injection
    // '.link_pages', //recomendation links
    // '.jp-relatedposts', //related posts
    // '.post-tags', //Tags
    // '.sharedaddy', //share elements
    // '[id*="more-"]', //more span
];

//embed content
const video_iframes = [
    'youtube', //YouTube
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const base_uri = libingester.util.get_doc_base_uri($, uri);
        const asset = new libingester.NewsArticle();
        const title = $('meta[property="og:title"]').attr('content');
        const synopsis = $('meta[property="og:description"]').attr('content');
        const thumb_url = $('meta[property="og:image"]').attr('content');
        const thumb = libingester.util.download_image(thumb_url);
        hatch.save_asset(thumb);

        thumb.set_title(title);
        asset.set_thumbnail(thumb);
        asset.set_section('algo');
        asset.set_canonical_uri(uri);
        asset.set_last_modified_date(new Date()); // no date
        asset.set_title(title);
        asset.set_synopsis(synopsis);

        const body = $('#Blog1 .post-body').first();

        //Download images
        body.find("img").map(function() {
            if (this.attribs.src) {
                const image = libingester.util.download_img(this, base_uri);
                image.set_title(title);
                hatch.save_asset(image);
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

        const content = mustache.render(template.structure_template, {
            title: title,
            body: body.html(),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    // const hatch = new libingester.Hatch();

    libingester.util.fetch_html(rss_uri).then(($) => {
        const links = $('entry').map(function() {
            return $(this).find('link[rel="alternate"]').attr('href');
        }).get();
        console.log(links);
    });
    // rss2json.load(rss_uri, function(err, rss) {
    //     const articles_links = rss.item.map((datum) => datum.url);
    //     console.log(articles_links);
    //     //Promise.all(articles_links.map((uri) => ingest_article(hatch, uri))).then(() => hatch.finish());
    // });

    // const links = [
    //     'http://www.alambudaya.com/2010/07/asal-usul-suku-baduykanekes-banten.html',
    //     'http://www.alambudaya.com/2014/12/7-tempat-wisata-wajib-di-macau-china.html',
    // ];
    // Promise.all(links.map((uri) => ingest_article(hatch, uri))).then(() => hatch.finish());
}

main();
