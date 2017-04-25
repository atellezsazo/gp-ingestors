'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const rss_uri = 'https://beritagar.id/rss'; //Artists
const base_uri = 'https://beritagar.id/';

//Remove elements (body)
const remove_elements = [
    'div.article-sharer',
    'div.gallery-list',
    'div.gallery-navigation',
    'div.gallery-single',
    'iframe',
];
// clean images
const remove_attr_img = [
    'data-src',
];

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const base_uri = libingester.util.get_doc_base_uri($, uri);
        const asset = new libingester.NewsArticle();
        const section = $('meta[property="article:section"]').attr('content');
        asset.set_section(section);

        //Set title section
        const title = $('meta[property="og:title"]').attr('content');
        asset.set_title(title);
        asset.set_canonical_uri(uri);

        // select body for 'galery' or 'article'
        if( section === 'GALERI' )
            var body = $('div.gallery-all').first();
        else
            var body = $('div.article-excerpt').first();

        // Pull out the updated date and section
        const modified_time = $('meta[property="article:modified_time"]').attr('content');
        asset.set_last_modified_date(new Date(Date.parse(modified_time)));
        const article_info = $('div.article-info').first();

        // clean body and tag info
        article_info.find('img').remove();
        for(const element of remove_elements)
            body.find(element).remove();

        // download image
        body.find('img').map(function() {
            if( this.attribs.src ){
                //console.log(this.attribs.src);
                const image = libingester.util.download_image( this.attribs.src );
                this.attribs["data-libingester-asset-id"] = image.asset_id;
                hatch.save_asset(image);
                for(const attr of remove_attr_img)
                    delete this.attribs[attr];
            }
        });

        // download videos
        const videos = body.find('iframe').map(function() {
            let video_url = this.attribs.src;
            video_url = video_url.substring(0, video_url.indexOf('?'));
            video_url = video_url.replace('embed/','watch?v=');
            const video_asset = new libingester.VideoAsset();
            video_asset.set_canonical_uri(video_url);
            video_asset.set_last_modified_date(modified_time);
            video_asset.set_title(title);
            video_asset.set_download_uri(video_url);
            hatch.save_asset(video_asset);
        });

        // render template
        const content = mustache.render(template.structure_template, {
            title: title,
            article_info: article_info.html(),
            body: body.html(),
        });

        asset.set_document(content);
        hatch.save_asset(asset);
    }).catch((err) => {
        console.log(err);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    rss2json.load(rss_uri, function(err, rss){
        const post_urls = rss.items.map((datum) => datum.url);
        Promise.all(post_urls.map( (uri) => ingest_article(hatch, uri) )).then( () => hatch.finish() );
    });
}

main();
