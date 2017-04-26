'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const rp = require('request-promise');
const template = require('./template');
const url = require('url');

const articles = "http://www.livingloving.net/"; // recent articles

//Remove elements
const remove_elements = [
    'div.sharedaddy',
    'banner', //ads
    'noscript', //any script injection
    'script', //any script injection
    '.jp-relatedposts',
    '.post-tags',
];

//Remove attributes (images)
const attr_image = [
    'class',
    'height',
    'id',
    'sizes',
    'src',
    'width',
];

//embbed content
const video_iframes = [
    'youtube', //YouTube
];

function ingest_article_profile(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($profile) => {
        const base_uri = libingester.util.get_doc_base_uri($profile, uri);
        const asset = new libingester.NewsArticle();
        asset.set_canonical_uri(uri);

        // pull out the updated date and section
        const modified_date = $profile('meta[property="article:modified_time"]').attr('content');
        const article_entry = $profile('.post .post-heading .meta').first();
        asset.set_last_modified_date(new Date( Date.parse(modified_date) ));
        const section = $profile('.post-heading .meta').children().text();
        asset.set_section(section);

        // set title section
        const title = $profile('meta[property="og:title"]').attr('content');
        asset.set_title(title);

        // pull out the main image
        const main_img = $profile('.post-img a img');
        const main_image = libingester.util.download_img(main_img, base_uri);
        hatch.save_asset(main_image);

        const body = $profile('.post-entry').first();

        // download videos
        const videos = $profile(".ytp-title .ytp-title-next a").map(function() {
            const iframe_src = this.attribs.src;
            console.log(iframe_src);
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

        // remove elements
        for (const remove_element of remove_elements) {
            body.find(remove_element).remove();
        }

        // download images
        body.find("img").map(function() {
            if (this.attribs.src != undefined) {
                const image = libingester.util.download_img(this, base_uri);
                hatch.save_asset(image);
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                for(const attr of attr_image)
                    delete this.attribs[attr];
            }
        });

        // render template
        const content = mustache.render(template.structure_template, {
            title: title,
            article_entry: article_entry,
            main_image: main_image,
            body: body.html()
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    libingester.util.fetch_html(articles).then(($pages) => {
        const articles_links = $pages('.post .post-entry .more-link').map(function() {
            const uri = $pages(this).attr('href');
            return url.resolve(articles, uri);
        }).get();

        Promise.all(articles_links.map((uri) => ingest_article_profile(hatch, uri))).then(() => {
            hatch.finish().then(() => hatch.copy_to_s3());
        });
    });
}

main();
